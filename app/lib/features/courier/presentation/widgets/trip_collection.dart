import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/brand_logo.dart';
import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../../establishments/presentation/format/money.dart';
import '../../../establishments/presentation/widgets/storefront.dart' show ReceiptClipper;
import '../../../orders/presentation/widgets/order_route.dart' show TicketClipper;
import '../../../orders/presentation/widgets/order_visuals.dart';
import '../../domain/courier.dart';
import '../../domain/pending_steps.dart';
import '../courier_providers.dart';
import 'duty_widgets.dart';
import 'receipt_capture.dart';
import 'trip_adjustment.dart' show PesosFormatter;

/// H10.2: lo que ya se cobró de ese pedido, del servidor o marcado sin señal (aún en la cola). null = sin cobrar.
List<CollectedPayment>? collectedPayments(PendingState pending, String orderCode, TripCollection? collection) =>
    collection?.payments ?? pending.collected[orderCode] ?? pending.of(orderCode).where((s) => s.kind == StepKind.collection).firstOrNull?.payments;

/// Lo que se cobra, en tiquete de tinta: es lo último que no se puede olvidar.
class CollectTicket extends StatelessWidget {
  const CollectTicket({super.key, required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    return ClipPath(
      clipper: const TicketClipper(notchAt: 0.62),
      child: Container(
        color: AppColors.ink,
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Eyebrow(l10n.tripCollect, color: AppColors.brand),
          const SizedBox(height: 4),
          Text(formatPesos(trip.customerTotalCents, language), style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w900, letterSpacing: -1)),
          const SizedBox(height: 18),
          Row(children: [
            Icon(paymentIcon(trip.paymentMethod), color: AppColors.brand, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(l10n.collectCustomerSaid(paymentLabel(l10n, trip.paymentMethod)), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800))),
          ]),
          const SizedBox(height: 4),
          Text(l10n.tripCollectBreakdown(formatPesos(trip.itemsCents, language), formatPesos(trip.feeCents, language)), style: const TextStyle(color: Colors.white54, fontSize: 12)),
        ]),
      ),
    );
  }
}

/// "38.500": los pesos como los muestra el campo mientras se escribe.
String _grouped(int pesos, String language) => pesos.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => language == 'en' ? ',' : '.');

int _pesosOf(TextEditingController c) => int.tryParse(c.text.replaceAll(RegExp(r'\D'), '')) ?? 0;

class _Part {
  _Part(this.method, String amount) : amount = TextEditingController(text: amount);

  String method;
  final TextEditingController amount;
}

/// La caja en la puerta (H10.2): con qué pagó el cliente y cuánto. Un toque si pagó lo pedido por el medio que
/// dijo; si pagó con dos medios, dos renglones. Los medios de cuenta muestran el QR del domiciliario en grande.
/// Se marca como los demás pasos: sin señal queda en la cola y sale sola.
class CollectionDesk extends ConsumerStatefulWidget {
  const CollectionDesk({super.key, required this.orderCode, required this.totalCents, required this.expectedMethod, this.collection, this.onCollected});

  final String orderCode;
  final int totalCents;

  /// El medio que el cliente eligió al pedir: el que viene marcado.
  final String expectedMethod;
  final TripCollection? collection;
  final VoidCallback? onCollected;

  @override
  ConsumerState<CollectionDesk> createState() => _CollectionDeskState();
}

class _CollectionDeskState extends ConsumerState<CollectionDesk> {
  final List<_Part> _parts = [];
  bool _busy = false;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // El monto inicial se escribe con el separador de miles del idioma, como lo deja el campo.
    if (_parts.isEmpty) _parts.add(_Part(widget.expectedMethod, _grouped((widget.totalCents + 99) ~/ 100, Localizations.localeOf(context).languageCode)));
  }

  @override
  void dispose() {
    for (final p in _parts) {
      p.amount.dispose();
    }
    super.dispose();
  }

  int get _enteredCents => _parts.fold(0, (sum, p) => sum + _pesosOf(p.amount) * 100);

  void _split(List<String> methods) {
    final language = Localizations.localeOf(context).languageCode;
    final left = widget.totalCents - _enteredCents;
    final next = methods.firstWhere((m) => _parts.every((p) => p.method != m), orElse: () => methods.first);
    setState(() {
      _error = null;
      _parts.add(_Part(next, left > 0 ? _grouped((left + 99) ~/ 100, language) : ''));
    });
  }

  void _drop(_Part part) => setState(() {
        _parts.remove(part);
        part.amount.dispose();
      });

  Future<void> _confirm(List<String> methods) async {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final payments = [for (final p in _parts) CollectedPayment(paymentMethod: p.method, amountCents: _pesosOf(p.amount) * 100)];
    final problem = payments.any((p) => !methods.contains(p.paymentMethod)) ? 'METHOD' : CollectionRules.problem(payments);
    if (problem != null) {
      setState(() => _error = _problemText(l10n, problem));
      return;
    }
    final gap = CollectionRules.total(payments) - widget.totalCents;
    // No cuadrar se puede (vuelto, cliente que quedó debiendo), pero se dice antes: el operador lo verá en el panel.
    if (gap != 0) {
      final go = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(gap < 0 ? l10n.collectShortTitle(formatPesos(-gap, language)) : l10n.collectOverTitle(formatPesos(gap, language))),
          content: Text(l10n.collectGapBody(formatPesos(widget.totalCents, language), formatPesos(CollectionRules.total(payments), language))),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.collectGapFix)),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.collectGapKeep)),
          ],
        ),
      );
      if (go != true || !mounted) return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final sent = await ref.read(pendingStepsProvider.notifier).submit(orderCode: widget.orderCode, kind: StepKind.collection, payments: payments);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: sent ? AppColors.leaf : AppColors.ink,
          content: Text(sent ? l10n.collectDoneToast(formatPesos(CollectionRules.total(payments), language)) : l10n.tripQueued),
        ));
      widget.onCollected?.call();
    } catch (error) {
      if (mounted) setState(() => _error = errorText(l10n, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final pending = ref.watch(pendingStepsProvider);
    final done = collectedPayments(pending, widget.orderCode, widget.collection);
    if (done != null) return CollectedReceipt(payments: done, queued: pending.of(widget.orderCode).any((s) => s.kind == StepKind.collection));

    final accounts = ref.watch(collectionAccountsProvider);
    // Sin señal no se sabe qué cuentas tiene: se deja el medio que dijo el cliente y la API lo revisa al salir la cola.
    final methods = accounts.hasValue ? CollectionRules.methods(accounts.value!) : {'CASH', widget.expectedMethod}.toList();
    final missingAccount = accounts.hasValue && !methods.contains(widget.expectedMethod);
    final gap = _enteredCents - widget.totalCents;

    return DutyCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(13)),
            child: const Icon(Icons.point_of_sale_rounded, color: AppColors.ink),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l10n.collectTitle, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900, letterSpacing: -0.3)),
              Text(l10n.collectHint, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.6))),
            ]),
          ),
        ]),
        if (missingAccount) ...[
          const SizedBox(height: 12),
          _Note(icon: Icons.info_outline_rounded, text: l10n.collectNoAccount(paymentLabel(l10n, widget.expectedMethod))),
        ],
        for (final (i, part) in _parts.indexed) ...[
          const SizedBox(height: 14),
          if (i > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(children: List.generate(28, (_) => Expanded(child: Container(height: 1.5, margin: const EdgeInsets.symmetric(horizontal: 2), color: AppColors.ink.withValues(alpha: 0.12))))),
            ),
          _PartRow(
            part: part,
            methods: methods,
            taken: {for (final p in _parts) if (p != part) p.method},
            language: language,
            onMethod: (m) => setState(() {
              part.method = m;
              _error = null;
            }),
            onAmount: () => setState(() => _error = null),
            onRemove: i == 0 ? null : () => _drop(part),
          ),
          if (accounts.value?.where((a) => a.paymentMethod == part.method).firstOrNull case final account?) ...[
            const SizedBox(height: 10),
            _AccountQr(account: account, amountCents: _pesosOf(part.amount) * 100),
          ],
        ],
        if (_parts.length < CollectionRules.maxPayments && methods.length > _parts.length)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _busy ? null : () => _split(methods),
              icon: const Icon(Icons.call_split_rounded),
              label: Text(l10n.collectSplit),
            ),
          ),
        const SizedBox(height: 6),
        _Balance(gapCents: gap, language: language),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Semantics(liveRegion: true, child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w800))),
          ),
        const SizedBox(height: 14),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(58), backgroundColor: AppColors.ink, foregroundColor: AppColors.brand),
          onPressed: _busy ? null : () => _confirm(methods),
          icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.brand)) : const Icon(Icons.task_alt_rounded),
          label: Text(l10n.collectConfirm(formatPesos(_enteredCents, language))),
        ),
      ]),
    );
  }
}

String _problemText(AppLocalizations l10n, String problem) => switch (problem) {
      'REPEATED_METHOD' => l10n.collectRepeated,
      'METHOD' => l10n.collectPickMethod,
      'TOO_MANY' => l10n.collectTooMany(CollectionRules.maxPayments),
      _ => l10n.collectAmountMissing,
    };

/// Un medio y su monto: fichas para el medio (como billetes en la mano) y el monto grande en pesos.
class _PartRow extends StatelessWidget {
  const _PartRow({required this.part, required this.methods, required this.taken, required this.language, required this.onMethod, required this.onAmount, this.onRemove});

  final _Part part;
  final List<String> methods;
  final Set<String> taken;
  final String language;
  final ValueChanged<String> onMethod;
  final VoidCallback onAmount;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final method in methods)
          _MethodChip(
            method: method,
            selected: part.method == method,
            enabled: !taken.contains(method),
            onTap: () => onMethod(method),
          ),
      ]),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(
          child: TextField(
            controller: part.amount,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10), PesosFormatter(language)],
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: -0.6),
            onChanged: (_) => onAmount(),
            decoration: InputDecoration(
              prefixIcon: const Padding(
                padding: EdgeInsets.only(left: 16, right: 6),
                child: Text('\$', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: AppColors.chonta)),
              ),
              prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
              hintText: l10n.collectAmountHint,
              hintStyle: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: AppColors.ink.withValues(alpha: 0.35)),
            ),
          ),
        ),
        if (onRemove != null) ...[
          const SizedBox(width: 6),
          IconButton(tooltip: l10n.collectRemove, onPressed: onRemove, icon: const Icon(Icons.remove_circle_outline_rounded), color: AppColors.chontaStrong),
        ],
      ]),
    ]);
  }
}

class _MethodChip extends StatelessWidget {
  const _MethodChip({required this.method, required this.selected, required this.enabled, required this.onTap});

  final String method;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final fg = selected ? AppColors.brand : AppColors.ink.withValues(alpha: enabled ? 1 : 0.3);
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? AppColors.ink : AppColors.cream,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: enabled && !selected ? onTap : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(paymentIcon(method), size: 18, color: fg),
              const SizedBox(width: 6),
              Text(paymentLabel(l10n, method), style: TextStyle(fontWeight: FontWeight.w800, color: selected ? Colors.white : fg)),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Cuadra, falta o sobra: el mismo semáforo que ve el operador en el panel.
class _Balance extends StatelessWidget {
  const _Balance({required this.gapCents, required this.language});

  final int gapCents;
  final String language;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final (color, bg, icon, text) = switch (gapCents) {
      0 => (AppColors.leaf, AppColors.leaf.withValues(alpha: 0.1), Icons.check_circle_rounded, l10n.collectBalanced),
      < 0 => (AppColors.chontaStrong, AppColors.chontaSoft, Icons.remove_circle_rounded, l10n.collectShort(formatPesos(-gapCents, language))),
      _ => (AppColors.ink, AppColors.cream, Icons.add_circle_rounded, l10n.collectOver(formatPesos(gapCents, language))),
    };
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
        child: Row(children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w800))),
        ]),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(14)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 18, color: AppColors.chontaStrong),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
        ]),
      );
}

/// La cuenta del medio elegido: "Mostrar mi QR" en grande para el cliente o, si aún no lo tiene, subirlo de la galería.
class _AccountQr extends ConsumerStatefulWidget {
  const _AccountQr({required this.account, required this.amountCents});

  final CollectionAccount account;
  final int amountCents;

  @override
  ConsumerState<_AccountQr> createState() => _AccountQrState();
}

class _AccountQrState extends ConsumerState<_AccountQr> {
  bool _busy = false;
  String? _error;

  Future<void> _upload() async {
    final l10n = AppLocalizations.of(context);
    final photo = await pickFromGallery();
    if (photo == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(courierRepositoryProvider).setAccountQr(widget.account.id, photo);
      ref.invalidate(collectionAccountsProvider);
    } catch (error) {
      if (mounted) setState(() => _error = errorText(l10n, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final account = widget.account;
    final method = paymentLabel(l10n, account.paymentMethod);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (account.qrUrl != null)
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: AppColors.brand, foregroundColor: AppColors.ink),
          onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
            fullscreenDialog: true,
            builder: (_) => CollectionQrScreen(account: account, amountCents: widget.amountCents),
          )),
          icon: const Icon(Icons.qr_code_2_rounded),
          label: Text(l10n.collectShowQr(method)),
        )
      else
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: _busy ? null : _upload,
          icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Icon(Icons.add_photo_alternate_rounded),
          label: Text(l10n.collectUploadQr(method)),
        ),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_error!, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w700))),
    ]);
  }
}

/// El QR a pantalla completa para que el cliente lo escanee: fondo de la marca, la cuenta y el monto bien grandes,
/// por si el lector falla y hay que dictar el número.
class CollectionQrScreen extends StatelessWidget {
  const CollectionQrScreen({super.key, required this.account, required this.amountCents});

  final CollectionAccount account;
  final int amountCents;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final method = paymentLabel(l10n, account.paymentMethod);
    return Scaffold(
      backgroundColor: AppColors.brand,
      appBar: AppBar(
        backgroundColor: AppColors.brand,
        foregroundColor: AppColors.ink,
        elevation: 0,
        title: const BrandLogo(size: 32, onDark: false),
        leading: IconButton(tooltip: l10n.close, onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(22, 22, 22, 18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(32),
                    boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.15), blurRadius: 30, offset: const Offset(0, 14))],
                  ),
                  child: Column(children: [
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(paymentIcon(account.paymentMethod), color: AppColors.chonta),
                      const SizedBox(width: 8),
                      Eyebrow(l10n.collectQrPayWith(method)),
                    ]),
                    const SizedBox(height: 14),
                    AspectRatio(
                      aspectRatio: 1,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(18),
                        child: Image.network(
                          account.qrUrl!,
                          fit: BoxFit.contain,
                          semanticLabel: l10n.collectQrPayWith(method),
                          loadingBuilder: (context, child, progress) => progress == null ? child : const Center(child: CircularProgressIndicator(color: AppColors.chonta)),
                          errorBuilder: (_, _, _) => Container(
                            color: AppColors.cream,
                            padding: const EdgeInsets.all(24),
                            alignment: Alignment.center,
                            child: Column(mainAxisSize: MainAxisSize.min, children: [
                              const Icon(Icons.signal_wifi_off_rounded, size: 40, color: AppColors.chonta),
                              const SizedBox(height: 10),
                              Text(l10n.collectQrOffline, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700)),
                            ]),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(account.holderName, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                    if (account.bank != null) Text(account.bank!, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
                    const SizedBox(height: 4),
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Flexible(
                        child: Text(
                          account.accountNumber,
                          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: 1, fontFeatures: [FontFeature.tabularFigures()]),
                        ),
                      ),
                      IconButton(
                        tooltip: l10n.collectCopyNumber,
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: account.accountNumber));
                          ScaffoldMessenger.of(context)
                            ..hideCurrentSnackBar()
                            ..showSnackBar(SnackBar(behavior: SnackBarBehavior.floating, backgroundColor: AppColors.ink, content: Text(l10n.collectCopied)));
                        },
                        icon: const Icon(Icons.copy_rounded),
                      ),
                    ]),
                  ]),
                ),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
                  decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(999)),
                  child: Text(
                    l10n.collectQrAmount(formatPesos(amountCents, language)),
                    style: const TextStyle(color: AppColors.brand, fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.4),
                  ),
                ),
                const SizedBox(height: 14),
                Text(l10n.collectQrHint, textAlign: TextAlign.center, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.7), fontWeight: FontWeight.w600)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// El cobro ya registrado: un recibo con el sello "COBRADO" (o "en cola" si aún no sale del teléfono).
class CollectedReceipt extends StatelessWidget {
  const CollectedReceipt({super.key, required this.payments, this.queued = false});

  final List<CollectedPayment> payments;
  final bool queued;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    return ClipPath(
      clipper: const ReceiptClipper(),
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(18, 24, 18, 18),
        child: Stack(clipBehavior: Clip.none, children: [
          Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Eyebrow(l10n.collectReceiptTitle),
            const SizedBox(height: 6),
            for (final p in payments)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Row(children: [
                  Icon(paymentIcon(p.paymentMethod), size: 18, color: AppColors.ink.withValues(alpha: 0.6)),
                  const SizedBox(width: 8),
                  Expanded(child: Text(paymentLabel(l10n, p.paymentMethod), style: const TextStyle(fontWeight: FontWeight.w700))),
                  Text(formatPesos(p.amountCents, language), style: const TextStyle(fontWeight: FontWeight.w800, fontFeatures: [FontFeature.tabularFigures()])),
                ]),
              ),
            if (payments.length > 1) ...[
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: Text(l10n.collectReceiptTotal, style: const TextStyle(fontWeight: FontWeight.w900))),
                Text(formatPesos(CollectionRules.total(payments), language), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              ]),
            ],
            if (queued) ...[
              const SizedBox(height: 10),
              Text(l10n.collectReceiptQueued, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
            ],
          ]),
          Positioned(
            right: 0,
            top: -6,
            child: ExcludeSemantics(child: _Stamp(text: queued ? l10n.collectStampQueued : l10n.collectStamp, color: queued ? AppColors.chonta : AppColors.leaf)),
          ),
        ]),
      ),
    );
  }
}

/// Sello de tinta inclinado, como el que se pone en la comanda pagada.
class _Stamp extends StatelessWidget {
  const _Stamp({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Transform.rotate(
        angle: -0.16,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withValues(alpha: 0.85), width: 2.5)),
          child: Text(text.toUpperCase(), style: TextStyle(color: color.withValues(alpha: 0.85), fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 2.5)),
        ),
      );
}

/// En el turno: lo entregado sin decir cómo le pagaron. La caja del día no cierra sin eso.
class PendingCollectionsBanner extends ConsumerWidget {
  const PendingCollectionsBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final pending = ref.watch(pendingStepsProvider);
    final orders = [
      for (final o in ref.watch(pendingCollectionsProvider).value ?? const <PendingCollection>[])
        if (collectedPayments(pending, o.code, null) == null) o,
    ];
    if (orders.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Material(
        color: AppColors.chontaSoft,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () => showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            useSafeArea: true,
            backgroundColor: AppColors.surface,
            shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
            builder: (_) => const _PendingCollectionsSheet(),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
            child: Row(children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(color: AppColors.chonta, borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.point_of_sale_rounded, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l10n.collectPendingTitle(orders.length), style: const TextStyle(fontWeight: FontWeight.w900, color: AppColors.chontaStrong)),
                  Text(l10n.collectPendingBody, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.65))),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.chontaStrong),
            ]),
          ),
        ),
      ),
    );
  }
}

class _PendingCollectionsSheet extends ConsumerStatefulWidget {
  const _PendingCollectionsSheet();

  @override
  ConsumerState<_PendingCollectionsSheet> createState() => _PendingCollectionsSheetState();
}

class _PendingCollectionsSheetState extends ConsumerState<_PendingCollectionsSheet> {
  String? _open;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final pending = ref.watch(pendingStepsProvider);
    final orders = [
      for (final o in ref.watch(pendingCollectionsProvider).value ?? const <PendingCollection>[])
        if (o.code == _open || collectedPayments(pending, o.code, null) == null) o,
    ];
    final open = orders.where((o) => o.code == _open).firstOrNull;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(18, 10, 18, 24), children: [
        Center(child: Container(width: 44, height: 5, decoration: BoxDecoration(color: AppColors.ink.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(9)))),
        const SizedBox(height: 14),
        Row(children: [
          if (open != null) IconButton(tooltip: l10n.collectBack, onPressed: () => setState(() => _open = null), icon: const Icon(Icons.arrow_back_rounded)),
          Expanded(child: Text(open == null ? l10n.collectPendingSheetTitle : open.storeName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.4))),
        ]),
        const SizedBox(height: 4),
        if (open == null) ...[
          Text(l10n.collectPendingSheetBody, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.65))),
          const SizedBox(height: 14),
          if (orders.isEmpty) _Note(icon: Icons.check_circle_rounded, text: l10n.collectPendingNone),
          for (final o in orders) ...[
            Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(22),
              clipBehavior: Clip.antiAlias,
              child: ListTile(
                contentPadding: const EdgeInsets.fromLTRB(16, 6, 10, 6),
                onTap: () => setState(() => _open = o.code),
                title: Text(o.storeName, style: const TextStyle(fontWeight: FontWeight.w900)),
                subtitle: Text('${o.code} · ${orderTime(o.closedAt, language)}'),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(formatPesos(o.customerTotalCents, language), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                  const Icon(Icons.chevron_right_rounded),
                ]),
              ),
            ),
            const SizedBox(height: 10),
          ],
        ] else ...[
          Text(l10n.collectPendingOrder(open.code, formatPesos(open.customerTotalCents, language)), style: TextStyle(color: AppColors.ink.withValues(alpha: 0.65))),
          const SizedBox(height: 14),
          CollectionDesk(
            key: ValueKey(open.code),
            orderCode: open.code,
            totalCents: open.customerTotalCents,
            expectedMethod: open.paymentMethod,
            onCollected: () => setState(() => _open = null),
          ),
        ],
      ]),
    );
  }
}
