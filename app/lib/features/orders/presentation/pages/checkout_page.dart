import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/map/brand_map.dart' show MapHandle;
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../../business/presentation/business_providers.dart';
import '../../../business/presentation/business_widgets.dart';
import '../../../establishments/domain/entities/cart.dart';
import '../../../establishments/domain/entities/establishment.dart';
import '../../../establishments/presentation/format/money.dart';
import '../../../establishments/presentation/providers/establishments_providers.dart';
import '../../domain/entities/order.dart';
import '../checkout_draft.dart';
import '../providers/orders_providers.dart';
import '../widgets/checkout_sections.dart';
import '../widgets/store_page.dart';

/// Confirmar el pedido (H04.1–H04.2): dónde, quién recibe y cómo paga, con la comanda debajo y el botón
/// siempre a mano. La ruta exige sesión; la canasta sigue en el teléfono hasta que la API acepta el pedido.
class CheckoutPage extends ConsumerWidget {
  const CheckoutPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final cart = ref.watch(cartProvider);
    if (cart == null) {
      return Scaffold(
        body: ListView(children: [
          StoreHeader(title: l10n.checkoutTitle, backTo: '/', backLabel: l10n.checkoutBack),
          DoorCard(
            icon: Icons.shopping_basket_rounded,
            title: l10n.checkoutEmptyTitle,
            body: l10n.checkoutEmptyBody,
            action: FilledButton(onPressed: () => context.go('/'), child: Text(l10n.checkoutToMap)),
          ),
        ]),
      );
    }
    final book = ref.watch(customerBookProvider);
    final methods = ref.watch(paymentMethodsProvider);
    return book.when(
      loading: () => Scaffold(body: ListView(children: [_header(context, cart), const Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator()))])),
      error: (error, _) => Scaffold(
        body: ListView(children: [
          _header(context, cart),
          DoorCard(
            icon: Icons.cloud_off_rounded,
            title: l10n.ordersLoadError,
            body: errorText(l10n, error),
            action: OutlinedButton(onPressed: () => ref.invalidate(customerBookProvider), child: Text(l10n.ordersRetry)),
          ),
        ]),
      ),
      data: (book) => _Checkout(cart: cart, addresses: book.addresses, recipients: book.recipients, methods: methods.value ?? const [PaymentOption('CASH')]),
    );
  }

  static Widget _header(BuildContext context, Cart cart) {
    final l10n = AppLocalizations.of(context);
    return StoreHeader(title: l10n.checkoutTitle, backTo: '/local/${cart.establishmentId}', backLabel: l10n.checkoutBack);
  }
}

class _Checkout extends ConsumerStatefulWidget {
  const _Checkout({required this.cart, required this.addresses, required this.recipients, required this.methods});

  final Cart cart;
  final List<SavedAddress> addresses;
  final List<SavedRecipient> recipients;
  final List<PaymentOption> methods;

  @override
  ConsumerState<_Checkout> createState() => _CheckoutState();
}

class _CheckoutState extends ConsumerState<_Checkout> {
  late CheckoutDraft _draft = CheckoutDraft.start(widget.addresses);
  final _map = MapHandle();
  final _reference = TextEditingController();
  final _line = TextEditingController();
  final _customLabel = TextEditingController();
  final _recipientName = TextEditingController();
  final _recipientPhone = TextEditingController();
  final _notes = TextEditingController();
  final _stepKeys = [GlobalKey(), GlobalKey(), GlobalKey()];

  OrderQuote? _quote;
  ZoneState _zone = const ZoneIdle();
  Object? _quoteError;
  String? _quoteKey;
  Timer? _debounce;
  ({List<String> removed, List<String> repriced})? _notice;
  bool _showErrors = false;
  bool _placing = false;
  String? _placeError;

  /// UUID por intento de compra: reintentar (sin red, doble toque) no crea un segundo pedido.
  final String _clientRequestId = _uuidV4();

  @override
  void initState() {
    super.initState();
    _bind(_reference, (d, v) => d.copyWith(reference: v));
    _bind(_line, (d, v) => d.copyWith(line: v));
    _bind(_customLabel, (d, v) => d.copyWith(customLabel: v));
    _bind(_recipientName, (d, v) => d.copyWith(recipientName: v));
    _bind(_recipientPhone, (d, v) => d.copyWith(recipientPhone: v));
    _bind(_notes, (d, v) => d.copyWith(notes: v));
    // Si el cliente comparte su ubicación, el mapa arranca en su puerta (salvo que ya haya movido el pin).
    ref.read(userLocationProvider.future).then((point) {
      if (!mounted || _draft.point != null) return;
      _change((d) => d.copyWith(point: point));
      if (_draft.pickingPoint) _moveMap(point);
    }, onError: (_) => _change((d) => d.copyWith(point: defaultCenter)));
    WidgetsBinding.instance.addPostFrameCallback((_) => _requote());
  }

  void _bind(TextEditingController controller, CheckoutDraft Function(CheckoutDraft, String) apply) =>
      controller.addListener(() => _change((d) => apply(d, controller.text)));

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [_reference, _line, _customLabel, _recipientName, _recipientPhone, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  void _change(CheckoutDraft Function(CheckoutDraft) change) {
    if (!mounted) return;
    setState(() {
      _draft = change(_draft);
      _placeError = null;
    });
    _requote();
  }

  void _moveMap(GeoPoint point) {
    // Si el mapa aún no se ha dibujado, arrancará en el punto del borrador.
    _map.move(point, 17).ignore();
  }

  /// Se cotiza al soltar el pin o cambiar la canasta (las notas de los productos no cambian el valor).
  void _requote() {
    final cart = ref.read(cartProvider);
    final target = _draft.quoteTarget;
    if (cart == null || target == null) return;
    final items = [for (final i in cart.checkoutItems) {'productVersionId': i['productVersionId'], 'quantity': i['quantity']}];
    final key = jsonEncode({'d': target.toJson(), 'i': items});
    if (key == _quoteKey) return;
    _quoteKey = key;
    _debounce?.cancel();
    setState(() => _zone = const ZoneLoading());
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      final language = Localizations.localeOf(context).languageCode;
      try {
        final quote = await ref.read(orderRepositoryProvider).quote(establishmentId: cart.establishmentId, items: items, delivery: target, language: language);
        if (!mounted || key != _quoteKey) return;
        setState(() {
          _quote = quote;
          _quoteError = null;
          _zone = ZoneFound(quote.zoneName, quote.feeCents);
        });
      } catch (error) {
        if (!mounted || key != _quoteKey) return;
        if (error is Failure && error.code == 'NO_COVERAGE') {
          setState(() {
            _zone = ZoneOutside((error.details['distanceMeters'] as num?)?.round());
            _quoteError = null;
          });
        } else if (!_correct(error)) {
          setState(() {
            _zone = const ZoneIdle();
            _quoteError = error;
          });
        }
      }
    });
  }

  /// La API dice qué productos cambiaron: la canasta se corrige y el cliente revisa antes de confirmar.
  bool _correct(Object error) {
    if (error is! Failure || (error.code != 'PRODUCTS_UNAVAILABLE' && error.code != 'PRODUCTS_CHANGED')) return false;
    final changes = (error.details['changes'] as List? ?? const []).whereType<Map>();
    final result = ref.read(cartProvider.notifier).correct(
      unavailable: (error.details['productIds'] as List? ?? const []).whereType<String>(),
      changed: {
        for (final c in changes)
          if (c['productId'] is String && c['versionId'] is String)
            c['productId'] as String: (versionId: c['versionId'] as String, priceCents: parsePriceCents('${c['price']}') ?? 0),
      },
    );
    setState(() {
      _notice = result;
      _quoteKey = null;
    });
    return true;
  }

  Future<void> _editNote(CartLine line) async {
    final l10n = AppLocalizations.of(context);
    final controller = TextEditingController(text: line.notes ?? '');
    final saved = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(line.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            autofocus: true,
            maxLength: Cart.maxNotes,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: l10n.checkoutLineNote, hintText: l10n.checkoutLineNotePlaceholder),
            onSubmitted: (value) => Navigator.pop(context, value),
          ),
          const SizedBox(height: 8),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text), child: Text(l10n.checkoutLineNote)),
        ]),
      ),
    );
    controller.dispose();
    if (saved != null) ref.read(cartProvider.notifier).setNotes(line.productId, saved);
  }

  Future<void> _submit(Cart cart) async {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    setState(() => _showErrors = true);
    final problems = _draft.problems;
    if (problems.isNotEmpty) {
      final step = switch (problems.first) {
        DraftProblem.point || DraftProblem.reference => 0,
        DraftProblem.recipient => 1,
        DraftProblem.payment => 2,
      };
      final target = _stepKeys[step].currentContext;
      if (target != null) await Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 350), alignment: 0.05);
      return;
    }
    setState(() {
      _placing = true;
      _placeError = null;
    });
    try {
      final order = await ref.read(orderRepositoryProvider).place(
            establishmentId: cart.establishmentId,
            items: cart.checkoutItems,
            delivery: _draft.deliveryTarget((label) => placeLabelText(l10n, label)),
            paymentMethod: _draft.payment!,
            recipient: _draft.recipient,
            notes: _draft.courierNotes((cash) => switch (cash) {
                  ExactCash() => l10n.checkoutCashExactNote,
                  Bill(:final cents) => l10n.checkoutCashNote(formatPesos(cents, language)),
                }),
            clientRequestId: _clientRequestId,
            language: language,
          );
      ref.invalidate(myOrdersProvider);
      // La canasta la vacía la página del pedido: vaciarla aquí mostraría "canasta vacía" mientras navega.
      if (mounted) context.go('/pedidos/${order.code}?nuevo=1');
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _placing = false;
        if (!_correct(error)) _placeError = errorText(l10n, error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final cart = ref.watch(cartProvider)!;
    ref.listen(cartProvider, (_, _) => _requote());
    final account = ref.watch(sessionProvider).value;
    final status = ref.watch(businessStatusProvider).value;
    final store = ref.watch(establishmentDetailProvider((cart.establishmentId, language))).value;
    final location = ref.watch(userLocationProvider);
    final device = ref.watch(deviceLocationProvider).value;

    final opening = status == null ? null : openingText(l10n, status, language);
    final storeClosed = store?.acceptsOrders == false;
    final closed = storeClosed || opening?.open == false;
    final totalCents = _quote != null && _zone is ZoneFound ? _quote!.totalCents : null;
    final blocked = closed || _zone is! ZoneFound || _quote == null || (_quote!.newCustomerLimit?.exceeded ?? false);
    final problems = _draft.problems;

    return Scaffold(
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          decoration: BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AppColors.ink.withValues(alpha: 0.08)))),
          child: closed
              // Fuera de horario el botón dice cuándo abrimos (RF-15); se puede dejar todo listo.
              ? FilledButton.icon(
                  onPressed: null,
                  style: FilledButton.styleFrom(disabledBackgroundColor: AppColors.ink, disabledForegroundColor: Colors.white),
                  icon: const Icon(Icons.schedule_rounded, color: AppColors.brand),
                  label: Text(storeClosed ? l10n.checkoutStoreClosed : opening!.detail, overflow: TextOverflow.ellipsis),
                )
              : FilledButton(
                  onPressed: blocked || _placing ? null : () => _submit(cart),
                  child: _placing
                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.ink))
                      : Text(totalCents == null ? l10n.checkoutConfirmShort : l10n.checkoutConfirm(formatPesos(totalCents, language))),
                ),
        ),
      ),
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          StoreHeader(
            title: l10n.checkoutTitle,
            backTo: '/local/${cart.establishmentId}',
            backLabel: l10n.checkoutBack,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const OpeningSign(),
                const SizedBox(height: 14),
                if (_notice != null) _CartNotice(notice: _notice!),
                StepCard(
                  key: _stepKeys[0],
                  number: 1,
                  title: l10n.checkoutStepWhere,
                  done: !problems.contains(DraftProblem.point) && !problems.contains(DraftProblem.reference) && _zone is ZoneFound,
                  child: DeliverySection(
                    draft: _draft,
                    onChange: _change,
                    addresses: widget.addresses,
                    zone: _zone,
                    mapCenter: location.value ?? defaultCenter,
                    mapController: _map,
                    onLocateMe: device == null ? null : () => _moveMap(device),
                    coverage: ref.watch(coverageProvider).value ?? const [],
                    referenceController: _reference,
                    lineController: _line,
                    customLabelController: _customLabel,
                    showErrors: _showErrors,
                    store: store?.location,
                  ),
                ),
                StepCard(
                  key: _stepKeys[1],
                  number: 2,
                  title: l10n.checkoutStepWho,
                  done: !problems.contains(DraftProblem.recipient),
                  child: RecipientSection(
                    draft: _draft,
                    onChange: _change,
                    recipients: widget.recipients,
                    myPhone: account?.phone,
                    nameController: _recipientName,
                    phoneController: _recipientPhone,
                    showErrors: _showErrors,
                  ),
                ),
                StepCard(
                  key: _stepKeys[2],
                  number: 3,
                  title: l10n.checkoutStepPay,
                  done: _draft.payment != null,
                  child: PaymentSection(draft: _draft, onChange: _change, methods: widget.methods, totalCents: totalCents, notesController: _notes, showErrors: _showErrors),
                ),
                const SizedBox(height: 4),
                ReceiptSection(
                  cart: cart,
                  quote: _quote,
                  zone: _zone,
                  onNote: _editNote,
                  footer: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (_quoteError != null) _ErrorLine(text: errorText(l10n, _quoteError!)),
                    if (_placeError != null) _ErrorLine(text: _placeError!),
                    const SizedBox(height: 12),
                    Text(l10n.checkoutLegal, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.5))),
                  ]),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CartNotice extends StatelessWidget {
  const _CartNotice({required this.notice});

  final ({List<String> removed, List<String> repriced}) notice;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.6)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(l10n.checkoutCartChanged, style: const TextStyle(fontWeight: FontWeight.w800)),
        if (notice.removed.isNotEmpty) Text(l10n.checkoutRemoved(notice.removed.join(', '))),
        if (notice.repriced.isNotEmpty) Text(l10n.checkoutRepriced(notice.repriced.join(', '))),
      ]),
    );
  }
}

class _ErrorLine extends StatelessWidget {
  const _ErrorLine({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(14)),
        child: Text(text, style: TextStyle(color: Colors.red.shade800, fontWeight: FontWeight.w600)),
      );
}

String _uuidV4() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
