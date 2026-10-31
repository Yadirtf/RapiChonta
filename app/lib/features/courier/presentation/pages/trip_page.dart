import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/error/failure.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../../auth/presentation/widgets/phone_field.dart' show formatPhone;
import '../../../establishments/presentation/format/money.dart';
import '../../../establishments/presentation/widgets/storefront.dart';
import '../../../orders/presentation/widgets/order_route.dart' show TicketClipper;
import '../../../orders/presentation/widgets/order_visuals.dart';
import '../../../orders/presentation/widgets/store_page.dart';
import '../../domain/courier.dart';
import '../../domain/pending_steps.dart';
import '../courier_providers.dart';
import '../widgets/duty_widgets.dart';
import '../widgets/pending_ribbon.dart';
import '../widgets/receipt_capture.dart';
import '../widgets/trip_actions.dart';
import '../widgets/trip_adjustment.dart';
import '../widgets/trip_collection.dart';
import '../widgets/trip_map.dart';

/// El pedido en curso (H08.3 a H08.6, H08.8), etapa por etapa. Las llegadas (al local y donde el cliente) las
/// marca el servidor con la ubicación; aquí solo se marcan la compra y "ya está listo". Lo marcado sin señal
/// se ve como hecho y sale solo al volver la conexión.
class TripPage extends ConsumerStatefulWidget {
  const TripPage({super.key, required this.code, this.cancelled = false});

  final String code;

  /// Se abrió desde el aviso de cancelación (E09): si el pedido ya no está, se dice por qué.
  final bool cancelled;

  @override
  ConsumerState<TripPage> createState() => _TripPageState();
}

class _TripPageState extends ConsumerState<TripPage> {
  /// El último estado visto de este pedido: si estaba esperando al cliente y desaparece, el cliente canceló (o
  /// se acabó el tiempo sin nada que comprar) y el domiciliario debe saberlo antes de comprar.
  String? _lastStatus;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final code = widget.code;
    final trip = ref.watch(courierTripProvider(language));
    final pending = ref.watch(pendingStepsProvider).of(code).toList();
    final current = trip.value;
    if (current != null && current.code == code) _lastStatus = current.status;

    return Scaffold(
      body: trip.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.chonta)),
        error: (error, _) => ListView(children: [
          StoreHeader(title: code, backTo: '/turno', backLabel: l10n.tripBackToShift),
          DoorCard(
            icon: Icons.cloud_off_rounded,
            title: l10n.courierLoadError,
            body: errorText(l10n, error),
            action: OutlinedButton(onPressed: () => ref.invalidate(courierTripProvider), child: Text(l10n.ordersRetry)),
          ),
        ]),
        data: (trip) {
          if (trip == null || trip.code != code) {
            final cancelled = widget.cancelled || _lastStatus == 'AWAITING_CUSTOMER';
            return ListView(children: [
              StoreHeader(title: code, backTo: '/turno', backLabel: l10n.tripBackToShift),
              DoorCard(
                icon: cancelled ? Icons.remove_shopping_cart_rounded : Icons.verified_rounded,
                title: cancelled ? l10n.tripCancelledTitle : l10n.tripDoneTitle,
                body: cancelled ? l10n.tripCancelledBody : l10n.tripDoneBody,
                action: FilledButton(onPressed: () => context.go('/turno'), child: Text(l10n.tripBackToShift)),
              ),
            ]);
          }
          final status = PendingRules.effectiveStatus(trip.status, pending);
          return _TripView(trip: trip, status: status, queued: pending.isNotEmpty);
        },
      ),
    );
  }
}

/// Etapas del recorrido en el riel de arriba (las de la ruta del cliente, contadas desde la moto). En el pedido
/// directo (E15) no hay compra ni preparación a cargo del domiciliario: se recoge lo que el local ya preparó.
const _rail = ['ACCEPTED', 'AT_ESTABLISHMENT', 'PREPARING', 'ON_THE_WAY', 'ARRIVING'];
const _directRail = ['ACCEPTED', 'AT_ESTABLISHMENT', 'ON_THE_WAY', 'ARRIVING'];

int _railIndex(String status, {required bool direct}) {
  final rail = direct ? _directRail : _rail;
  return switch (status) {
    'AWAITING_CUSTOMER' => 1,
    'PENDING_REVIEW' || 'DISPUTED' => rail.length - 1,
    _ => rail.indexOf(status),
  };
}

bool _onMap(String status) => const {'ACCEPTED', 'ON_THE_WAY', 'ARRIVING'}.contains(status);

class _TripView extends ConsumerWidget {
  const _TripView({required this.trip, required this.status, required this.queued});

  final Trip trip;
  final String status;
  final bool queued;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final towardsCustomer = status != 'ACCEPTED';
    final top = MediaQuery.paddingOf(context).top;

    final Widget header = _onMap(status)
        ? SizedBox(
            height: 300 + top,
            child: Stack(children: [
              Positioned.fill(
                child: TripMap(
                  code: trip.code,
                  store: trip.storeLocation,
                  area: trip.storeArea,
                  destination: trip.destination?.location,
                  me: ref.watch(locationTrackerProvider).position,
                  towardsCustomer: towardsCustomer,
                ),
              ),
              const Positioned(left: 0, right: 0, top: 0, child: IgnorePointer(child: Awning(height: 14, stripe: 14))),
              Positioned(left: 12, top: top + 20, child: _BackButton(label: l10n.tripBackToShift)),
              Positioned(right: 12, top: top + 22, child: _CodeTag(code: trip.code)),
            ]),
          )
        : Stack(children: [
            const Awning(height: 64),
            SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 30, 12, 8),
                child: Row(children: [_BackButton(label: l10n.tripBackToShift), const Spacer(), _CodeTag(code: trip.code)]),
              ),
            ),
          ]);

    return RefreshIndicator(
      color: AppColors.chonta,
      onRefresh: () async {
        await ref.read(pendingStepsProvider.notifier).flush();
        ref.invalidate(courierTripProvider);
      },
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          header,
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 36),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 640),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  _StageRail(current: _railIndex(status, direct: trip.direct), direct: trip.direct),
                  const SizedBox(height: 16),
                  PendingStepsRibbon(orderCode: trip.code),
                  ...switch (status) {
                    'ACCEPTED' => [_ToStoreStage(trip: trip)],
                    'AT_ESTABLISHMENT' => [trip.direct ? _PickUpStage(trip: trip) : _BuyStage(trip: trip)],
                    'AWAITING_CUSTOMER' => [WaitingCustomerStage(trip: trip), const SizedBox(height: 16), _BillTicket(trip: trip, language: Localizations.localeOf(context).languageCode)],
                    'PREPARING' => [_PrepStage(trip: trip, purchaseQueued: trip.status != 'PREPARING')],
                    'ON_THE_WAY' || 'ARRIVING' => [_DeliverStage(trip: trip, arriving: status == 'ARRIVING', arrivalQueued: trip.status == 'ON_THE_WAY')],
                    _ => [_OtherStage(status: status)],
                  },
                ]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BackButton extends StatelessWidget {
  const _BackButton({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        shape: const CircleBorder(),
        elevation: 4,
        shadowColor: AppColors.ink.withValues(alpha: 0.3),
        child: IconButton(
          tooltip: label,
          onPressed: () => context.canPop() ? context.pop() : context.go('/turno'),
          icon: const Icon(Icons.arrow_back_rounded, color: AppColors.ink),
        ),
      );
}

class _CodeTag extends StatelessWidget {
  const _CodeTag({required this.code});

  final String code;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.ink,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.3), blurRadius: 10, offset: const Offset(0, 4))],
        ),
        child: Text(code, style: const TextStyle(color: AppColors.brand, fontFamily: 'monospace', fontWeight: FontWeight.w900, letterSpacing: 1.5)),
      );
}

/// Riel de sellos: los hechos en hoja, el actual en chontaduro inclinado, los que faltan en blanco.
class _StageRail extends StatelessWidget {
  const _StageRail({required this.current, required this.direct});

  final int current;
  final bool direct;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final labels = direct
        ? [l10n.railStore, l10n.railPickUp, l10n.railRoad, l10n.railDoor]
        : [l10n.railStore, l10n.railBuy, l10n.railPrep, l10n.railRoad, l10n.railDoor];
    final icons = direct
        ? [Icons.storefront_rounded, Icons.takeout_dining_rounded, Icons.two_wheeler_rounded, Icons.where_to_vote_rounded]
        : [Icons.storefront_rounded, Icons.receipt_long_rounded, Icons.soup_kitchen_rounded, Icons.two_wheeler_rounded, Icons.where_to_vote_rounded];
    return Semantics(
      label: current >= 0 ? l10n.tripStageOf(current + 1, labels.length, labels[current]) : null,
      child: ExcludeSemantics(
        child: Row(children: [
          for (var i = 0; i < labels.length; i++) ...[
            Expanded(
              child: Column(children: [
                Transform.rotate(
                  angle: i == current ? -0.1 : 0,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    width: i == current ? 42 : 34,
                    height: i == current ? 42 : 34,
                    decoration: BoxDecoration(
                      color: i < current ? AppColors.leaf : (i == current ? AppColors.chonta : Colors.white),
                      borderRadius: BorderRadius.circular(12),
                      border: i > current ? Border.all(color: AppColors.ink.withValues(alpha: 0.12), width: 2) : null,
                    ),
                    child: Icon(i < current ? Icons.check_rounded : icons[i], size: i == current ? 22 : 17, color: i > current ? AppColors.ink.withValues(alpha: 0.35) : Colors.white),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  labels[i],
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: i == current ? FontWeight.w900 : FontWeight.w600,
                    color: i == current ? AppColors.chontaStrong : AppColors.ink.withValues(alpha: i < current ? 0.7 : 0.45),
                  ),
                ),
              ]),
            ),
          ],
        ]),
      ),
    );
  }
}

/// Lo que hay que comprar, como la comanda del cliente (con sus notas).
class _ShoppingList extends StatelessWidget {
  const _ShoppingList({required this.trip, this.checked, this.onToggle});

  final Trip trip;
  final Set<int>? checked;
  final ValueChanged<int>? onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final muted = AppColors.ink.withValues(alpha: 0.6);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (var i = 0; i < trip.lines.length; i++)
        _Line(line: trip.lines[i], checked: checked?.contains(i), onTap: onToggle == null ? null : () => onToggle!(i)),
      if (trip.notes != null) ...[
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(14)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.sticky_note_2_rounded, size: 18, color: AppColors.chonta),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(l10n.ordersNotes.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1, color: muted)),
                Text(trip.notes!, style: const TextStyle(fontWeight: FontWeight.w600)),
              ]),
            ),
          ]),
        ),
      ],
    ]);
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.line, this.checked, this.onTap});

  final TripLine line;
  final bool? checked;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final done = checked ?? false;
    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (checked != null) ...[
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: done ? AppColors.leaf : Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: done ? AppColors.leaf : AppColors.ink.withValues(alpha: 0.25), width: 2),
            ),
            child: done ? const Icon(Icons.check_rounded, size: 16, color: Colors.white) : null,
          ),
          const SizedBox(width: 10),
        ],
        SizedBox(width: 32, child: Text('${line.quantity}×', style: const TextStyle(color: AppColors.chonta, fontWeight: FontWeight.w900, fontSize: 16))),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              line.name,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 16,
                decoration: done ? TextDecoration.lineThrough : null,
                color: done ? AppColors.ink.withValues(alpha: 0.45) : AppColors.ink,
              ),
            ),
            if (line.notes != null) Text(line.notes!, style: TextStyle(fontSize: 13, fontStyle: FontStyle.italic, color: AppColors.ink.withValues(alpha: 0.6))),
          ]),
        ),
      ]),
    );
    if (onTap == null) return row;
    return Semantics(checked: done, child: InkWell(borderRadius: BorderRadius.circular(10), onTap: onTap, child: row));
  }
}

/// Nota de geocerca: lo que va a pasar solo, sin tocar nada.
class _AutoNote extends StatelessWidget {
  const _AutoNote({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.brand.withValues(alpha: 0.22), borderRadius: BorderRadius.circular(16)),
        child: Row(children: [
          const Icon(Icons.radar_rounded, color: AppColors.chontaStrong),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
        ]),
      );
}

// ── ACCEPTED: rumbo al local ──

class _ToStoreStage extends StatelessWidget {
  const _ToStoreStage({required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      DutyCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Eyebrow(l10n.tripGoToStore),
          const SizedBox(height: 4),
          Text(trip.storeName, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: -0.6)),
          Text(trip.storeAddress, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6))),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () => openDirections(trip.storeLocation, trip.storeName),
                icon: const Icon(Icons.directions_rounded),
                label: Text(l10n.tripDirections),
              ),
            ),
            if (trip.storePhone != null) ...[
              const SizedBox(width: 10),
              _RoundAction(icon: Icons.call_rounded, label: l10n.tripCallStore, onTap: () => callPhone(trip.storePhone!)),
            ],
          ]),
          const SizedBox(height: 12),
          _AutoNote(text: l10n.tripAutoArrival),
        ]),
      ),
      const SizedBox(height: 16),
      DutyCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Eyebrow(l10n.tripShoppingList)),
            Text(formatPesos(trip.itemsCents, language), style: const TextStyle(fontWeight: FontWeight.w900)),
          ]),
          const SizedBox(height: 6),
          _ShoppingList(trip: trip),
        ]),
      ),
    ]);
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: label,
        child: Material(
          color: AppColors.ink,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onTap,
            child: SizedBox(width: 52, height: 52, child: Icon(icon, color: AppColors.brand, semanticLabel: label)),
          ),
        ),
      );
}

// ── AT_ESTABLISHMENT: comprar, pagar y la foto de la factura (H08.4) ──

class _BuyStage extends ConsumerStatefulWidget {
  const _BuyStage({required this.trip});

  final Trip trip;

  @override
  ConsumerState<_BuyStage> createState() => _BuyStageState();
}

class _BuyStageState extends ConsumerState<_BuyStage> {
  final _amount = TextEditingController();
  final _checked = <int>{};
  ReceiptPhoto? _photo;
  bool _busy = false;
  bool _tried = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  int? get _pesos {
    final digits = _amount.text.replaceAll(RegExp(r'\D'), '');
    final value = int.tryParse(digits);
    return value == null || value <= 0 ? null : value;
  }

  Future<void> _capture() async {
    final photo = await captureReceipt();
    if (photo != null && mounted) setState(() => _photo = photo);
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _tried = true);
    final pesos = _pesos;
    if (pesos == null || _photo == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final sent = await ref.read(pendingStepsProvider.notifier).submit(orderCode: widget.trip.code, kind: StepKind.purchase, amount: '$pesos', receipt: _photo);
      if (!sent && mounted) _queuedNotice(context);
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
    final trip = widget.trip;
    final pesos = _pesos;
    final diff = pesos == null ? 0 : pesos * 100 - trip.itemsCents;
    final answered = trip.adjustment?.open == false ? trip.adjustment : null;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (answered != null) ...[CustomerDecisionCard(adjustment: answered), const SizedBox(height: 16)],
      _BillTicket(trip: trip, language: language),
      const SizedBox(height: 16),
      StepCard(
        number: 1,
        title: l10n.tripShoppingList,
        done: _checked.length == trip.lines.length,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(l10n.tripChecked(_checked.length, trip.lines.length), style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
          _ShoppingList(
            trip: trip,
            checked: _checked,
            onToggle: (i) => setState(() => _checked.contains(i) ? _checked.remove(i) : _checked.add(i)),
          ),
          // H09.2: algo se acabó o el local pide otro precio. Se le pregunta al cliente antes de pagar.
          if (trip.lines.any((l) => l.id != null)) ...[const SizedBox(height: 10), ReportProblemButton(trip: trip)],
        ]),
      ),
      StepCard(
        number: 2,
        title: l10n.tripPaidTotal,
        done: pesos != null,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(
            controller: _amount,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10), PesosFormatter(language)],
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.6),
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              // Siempre a la vista (prefixText solo aparece al escribir): es un monto en pesos.
              prefixIcon: const Padding(
                padding: EdgeInsets.only(left: 16, right: 6),
                child: Text('\$', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: AppColors.chonta)),
              ),
              prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
              hintText: l10n.tripAmountHint,
              hintStyle: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: AppColors.ink.withValues(alpha: 0.35)),
              errorText: _tried && pesos == null ? l10n.tripAmountMissing : null,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            pesos != null && diff != 0
                ? l10n.tripAmountVsQuote(formatPesos(trip.itemsCents, language), formatPesos(diff.abs(), language), diff > 0 ? 'more' : 'less')
                : l10n.tripAmountQuote(formatPesos(trip.itemsCents, language)),
            style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.6)),
          ),
        ]),
      ),
      StepCard(
        number: 3,
        title: l10n.tripReceipt,
        done: _photo != null,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          ReceiptTile(photo: _photo, onCapture: _capture, missing: _tried && _photo == null),
          if (_tried && _photo == null)
            Padding(padding: const EdgeInsets.only(top: 6), child: Text(l10n.tripReceiptMissing, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w700))),
        ]),
      ),
      if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(_error!, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w700))),
      FilledButton.icon(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(58), backgroundColor: AppColors.ink, foregroundColor: AppColors.brand),
        onPressed: _busy ? null : _submit,
        icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.brand)) : const Icon(Icons.task_alt_rounded),
        label: Text(l10n.tripConfirmPurchase),
      ),
      const SizedBox(height: 8),
      Text(l10n.tripPurchaseHint, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
    ]);
  }
}

// ── AT_ESTABLISHMENT en un pedido directo (E15): el local lo preparó; se revisa, se le paga lo suyo y se recoge ──

class _PickUpStage extends ConsumerStatefulWidget {
  const _PickUpStage({required this.trip});

  final Trip trip;

  @override
  ConsumerState<_PickUpStage> createState() => _PickUpStageState();
}

class _PickUpStageState extends ConsumerState<_PickUpStage> {
  final _checked = <int>{};
  bool _busy = false;
  String? _error;

  Future<void> _pickUp() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final sent = await ref.read(pendingStepsProvider.notifier).submit(orderCode: widget.trip.code, kind: StepKind.pickUp);
      if (!sent && mounted) _queuedNotice(context);
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
    final trip = widget.trip;
    final merchant = trip.merchant;
    final ready = merchant?.readyAt != null;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (merchant != null) ...[
        _MerchantReadiness(ready: ready, at: orderTime(merchant.readyAt ?? merchant.estimatedReadyAt, language)),
        const SizedBox(height: 16),
      ],
      _BillTicket(trip: trip, language: language),
      const SizedBox(height: 16),
      StepCard(
        number: 1,
        title: l10n.tripPickUpCheck,
        done: _checked.length == trip.lines.length,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(l10n.tripChecked(_checked.length, trip.lines.length), style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
          _ShoppingList(
            trip: trip,
            checked: _checked,
            onToggle: (i) => setState(() => _checked.contains(i) ? _checked.remove(i) : _checked.add(i)),
          ),
        ]),
      ),
      StepCard(
        number: 2,
        title: l10n.tripPayMerchant,
        done: false,
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(child: Text(l10n.tripPayMerchantHint, style: TextStyle(fontSize: 13, color: AppColors.ink.withValues(alpha: 0.65)))),
          const SizedBox(width: 12),
          Text(
            formatPesos(trip.itemsCents, language),
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.6, color: AppColors.chontaStrong, fontFeatures: [FontFeature.tabularFigures()]),
          ),
        ]),
      ),
      if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(_error!, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w700))),
      FilledButton.icon(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(58), backgroundColor: AppColors.ink, foregroundColor: AppColors.brand),
        onPressed: _busy ? null : _pickUp,
        icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.brand)) : const Icon(Icons.takeout_dining_rounded),
        label: Text(l10n.tripConfirmPickUp),
      ),
      const SizedBox(height: 8),
      Text(l10n.tripPickUpHint, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
    ]);
  }
}

/// Lo que dijo el comercio aliado: a qué hora lo tendría o que ya está empacado.
class _MerchantReadiness extends StatelessWidget {
  const _MerchantReadiness({required this.ready, required this.at});

  final bool ready;
  final String at;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final tone = ready ? AppColors.leaf : AppColors.brand;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 16, 12),
      decoration: BoxDecoration(color: tone.withValues(alpha: ready ? 0.12 : 0.22), borderRadius: BorderRadius.circular(20)),
      child: Row(children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: ready ? AppColors.leaf : AppColors.ink, borderRadius: BorderRadius.circular(13)),
          child: Icon(ready ? Icons.inventory_2_rounded : Icons.soup_kitchen_rounded, color: ready ? Colors.white : AppColors.brand, size: 21),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(ready ? l10n.tripMerchantReady : l10n.tripMerchantPreparing(at), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
            Text(ready ? l10n.tripMerchantReadyAt(at) : l10n.tripMerchantPreparingHint, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.6))),
          ]),
        ),
      ]),
    );
  }
}

void _queuedNotice(BuildContext context) {
  final l10n = AppLocalizations.of(context);
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(behavior: SnackBarBehavior.floating, backgroundColor: AppColors.ink, content: Text(l10n.tripQueued)));
}

// ── PREPARING: la cuenta de preparación y "¿ya está listo?" (H08.5) ──

class _PrepStage extends ConsumerStatefulWidget {
  const _PrepStage({required this.trip, required this.purchaseQueued});

  final Trip trip;

  /// La compra está en la cola sin señal: todavía no hay cuenta del servidor.
  final bool purchaseQueued;

  @override
  ConsumerState<_PrepStage> createState() => _PrepStageState();
}

class _PrepStageState extends ConsumerState<_PrepStage> {
  Timer? _tick;
  StepKind? _busy;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _mark(StepKind kind) async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = kind;
      _error = null;
    });
    try {
      final sent = await ref.read(pendingStepsProvider.notifier).submit(orderCode: widget.trip.code, kind: kind);
      if (!sent && mounted) _queuedNotice(context);
      if (sent && kind == StepKind.delay && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(behavior: SnackBarBehavior.floating, content: Text(l10n.tripDelayHint)));
      }
    } catch (error) {
      if (mounted) setState(() => _error = errorText(l10n, error));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final prep = widget.trip.preparation;
    final now = DateTime.now();
    final left = prep?.estimatedReadyAt.difference(now);
    final window = prep?.estimatedReadyAt.difference(prep.startedAt);
    final due = prep != null && !prep.estimatedReadyAt.isAfter(now);
    final fraction = left == null || window == null || window.inSeconds <= 0 ? 1.0 : left.inSeconds / window.inSeconds;
    final minutes = left == null ? 0 : (left.inSeconds / 60).ceil();
    final purchase = widget.trip.purchase;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      DutyCard(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
        child: Column(children: [
          Eyebrow(widget.trip.storeName),
          const SizedBox(height: 4),
          Text(due ? l10n.tripReadyNowTitle : l10n.tripPreparingTitle, textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
          const SizedBox(height: 16),
          Semantics(
            liveRegion: due,
            label: prep == null ? l10n.tripQueued : (due ? l10n.tripReadyNow : l10n.tripReadyIn(minutes)),
            child: CountdownRing(
              size: 176,
              stroke: 12,
              fraction: prep == null ? 1 : (due ? 1 : fraction),
              urgent: due,
              child: ExcludeSemantics(
                child: prep == null
                    ? const Icon(Icons.cloud_upload_rounded, size: 44, color: AppColors.chonta)
                    : Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(due ? Icons.notifications_active_rounded : Icons.soup_kitchen_rounded, color: due ? AppColors.chonta : AppColors.leaf, size: 30),
                        Text(
                          due ? l10n.tripReadyNowShort : '$minutes',
                          style: TextStyle(fontSize: due ? 18 : 48, fontWeight: FontWeight.w900, height: 1.05, letterSpacing: -1, color: due ? AppColors.chontaStrong : AppColors.ink),
                        ),
                        if (!due) Text(l10n.tripMinutes, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.ink.withValues(alpha: 0.55))),
                      ]),
              ),
            ),
          ),
          const SizedBox(height: 14),
          if (prep != null && prep.delayCount > 0)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: AppColors.chontaSoft, borderRadius: BorderRadius.circular(99)),
              child: Text(l10n.tripDelayed(prep.delayCount), style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w800, fontSize: 12)),
            ),
          Text(
            widget.purchaseQueued ? l10n.tripQueued : (due ? l10n.tripReadyQuestion : l10n.tripPreparingBody),
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.ink.withValues(alpha: 0.65)),
          ),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w700))),
          const SizedBox(height: 16),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(58), backgroundColor: AppColors.leaf, foregroundColor: Colors.white),
            onPressed: _busy != null ? null : () => _mark(StepKind.ready),
            icon: _busy == StepKind.ready
                ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                : const Icon(Icons.shopping_bag_rounded),
            label: Text(l10n.tripReady),
          ),
          // "Sigue en preparación" tiene sentido cuando ya se cumplió el tiempo (es la respuesta al aviso).
          if (due) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              onPressed: _busy != null || widget.purchaseQueued ? null : () => _mark(StepKind.delay),
              icon: _busy == StepKind.delay ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Icon(Icons.hourglass_top_rounded),
              label: Text(l10n.tripStillPreparing),
            ),
          ],
        ]),
      ),
      const SizedBox(height: 16),
      _BillTicket(trip: widget.trip, language: language),
      if (purchase != null) ...[
        const SizedBox(height: 16),
        _PaidCard(amountCents: purchase.amountCents, receiptUrl: purchase.receiptUrl, language: language),
      ],
    ]);
  }
}

/// La cuenta del pedido antes de salir del local: lo que valen los productos, el domicilio y lo que se cobra al
/// entregar. Así el domiciliario sabe desde la compra cuánto va a recibir y con qué medio.
class _BillTicket extends StatelessWidget {
  const _BillTicket({required this.trip, required this.language});

  final Trip trip;
  final String language;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    Widget row(String term, int cents) => Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Row(children: [
            Expanded(child: Text(term, style: const TextStyle(color: Colors.white70, fontSize: 14))),
            Text(formatPesos(cents, language), style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800, fontFeatures: [FontFeature.tabularFigures()])),
          ]),
        );
    return ClipPath(
      clipper: const TicketClipper(notchAt: 0.5),
      child: Container(
        color: AppColors.ink,
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Eyebrow(l10n.tripBillTitle, color: AppColors.brand),
          const SizedBox(height: 2),
          row(l10n.tripBillItems, trip.itemsCents),
          row(l10n.tripBillFee, trip.feeCents),
          // La línea de corte cae en las muescas del tiquete.
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(children: List.generate(
              24,
              (i) => Expanded(child: Container(height: 1.5, margin: const EdgeInsets.symmetric(horizontal: 2), color: Colors.white24)),
            )),
          ),
          Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(l10n.tripCollect, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Row(children: [
                  Icon(paymentIcon(trip.paymentMethod), color: AppColors.brand, size: 16),
                  const SizedBox(width: 6),
                  Flexible(child: Text(paymentLabel(l10n, trip.paymentMethod), style: const TextStyle(color: Colors.white70, fontSize: 12))),
                ]),
              ]),
            ),
            Text(
              formatPesos(trip.customerTotalCents, language),
              style: const TextStyle(color: AppColors.brand, fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.8),
            ),
          ]),
        ]),
      ),
    );
  }
}

/// Lo que pagó en el local, con la factura (el cliente ve lo mismo).
class _PaidCard extends StatelessWidget {
  const _PaidCard({required this.amountCents, required this.receiptUrl, required this.language});

  final int amountCents;
  final String? receiptUrl;
  final String language;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return ClipPath(
      clipper: const ReceiptClipper(),
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(18, 22, 18, 16),
        child: Row(children: [
          if (receiptUrl != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.network(receiptUrl!, width: 56, height: 72, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox(width: 56, height: 72)),
            ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Eyebrow(l10n.tripPaidLabel),
              Text(formatPesos(amountCents, language), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: -0.6)),
            ]),
          ),
        ]),
      ),
    );
  }
}

// ── ON_THE_WAY / ARRIVING: el destino, quién recibe, cuánto cobrar y el cierre con código (H08.6, E10) ──

class _DeliverStage extends StatelessWidget {
  const _DeliverStage({required this.trip, required this.arriving, required this.arrivalQueued});

  final Trip trip;
  final bool arriving;

  /// "Llegué" marcado sin señal: se ve como llegado, pero el servidor aún no lo sabe.
  final bool arrivalQueued;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final destination = trip.destination;
    final collect = CollectTicket(trip: trip);
    final whereTo = DutyCard(
      child: destination == null
          ? Row(children: [
              const Icon(Icons.cloud_off_rounded, color: AppColors.chonta),
              const SizedBox(width: 10),
              Expanded(child: Text(l10n.tripDestinationOffline, style: const TextStyle(fontWeight: FontWeight.w700))),
            ])
          : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Eyebrow(l10n.tripTakeTo),
              const SizedBox(height: 4),
              Text(
                destination.label ?? destination.reference ?? destination.line ?? '',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.5),
              ),
              for (final extra in [if (destination.label != null) destination.reference, destination.line].whereType<String>())
                Text(extra, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.65))),
              const SizedBox(height: 14),
              Row(children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(13)),
                  child: const Icon(Icons.person_rounded, color: AppColors.chonta),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(l10n.tripRecipient.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1, color: AppColors.ink.withValues(alpha: 0.45))),
                    Text(destination.recipientName, style: const TextStyle(fontWeight: FontWeight.w800)),
                    if (destination.recipientPhone != null) Text(formatPhone(destination.recipientPhone), style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.6))),
                  ]),
                ),
                if (destination.recipientPhone != null) _RoundAction(icon: Icons.call_rounded, label: l10n.tripCall, onTap: () => callPhone(destination.recipientPhone!)),
              ]),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: () => openDirections(destination.location, destination.label ?? trip.code),
                icon: const Icon(Icons.directions_rounded),
                label: Text(l10n.tripDirections),
              ),
              if (!arriving) ...[const SizedBox(height: 12), _AutoNote(text: l10n.tripAutoArriving), const SizedBox(height: 10), _ArrivedButton(trip: trip)],
            ]),
    );

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (arriving) ...[
        Semantics(
          liveRegion: true,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.chonta, borderRadius: BorderRadius.circular(22)),
            child: Row(children: [
              const Icon(Icons.where_to_vote_rounded, color: Colors.white, size: 30),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l10n.tripArrivingTitle, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w900)),
                  Text(l10n.tripArrivingBody, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                ]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        // Donde el cliente el orden es el de la entrega: cobrar, pedir el código, y (si no aparece) llamar.
        collect,
        const SizedBox(height: 16),
        CollectionDesk(orderCode: trip.code, totalCents: trip.customerTotalCents, expectedMethod: trip.paymentMethod, collection: trip.collection),
        const SizedBox(height: 16),
        _HandoverCard(trip: trip, arrivalQueued: arrivalQueued),
        const SizedBox(height: 16),
        whereTo,
      ] else ...[
        whereTo,
        const SizedBox(height: 16),
        collect,
      ],
      if (trip.purchase != null) ...[
        const SizedBox(height: 16),
        _PaidCard(amountCents: trip.purchase!.amountCents, receiptUrl: trip.purchase!.receiptUrl, language: language),
      ],
    ]);
  }
}

/// "Llegué": por si la geocerca no lo detecta (GPS impreciso, edificio). Se encola como los demás pasos.
class _ArrivedButton extends ConsumerStatefulWidget {
  const _ArrivedButton({required this.trip});

  final Trip trip;

  @override
  ConsumerState<_ArrivedButton> createState() => _ArrivedButtonState();
}

class _ArrivedButtonState extends ConsumerState<_ArrivedButton> {
  bool _busy = false;
  String? _error;

  Future<void> _mark() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final sent = await ref.read(pendingStepsProvider.notifier).submit(orderCode: widget.trip.code, kind: StepKind.arrived);
      if (!sent && mounted) _queuedNotice(context);
    } catch (error) {
      if (mounted) setState(() => _error = errorText(l10n, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(l10n.tripArrivedHint, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.6))),
      const SizedBox(height: 8),
      OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), side: const BorderSide(color: AppColors.ink, width: 2)),
        onPressed: _busy ? null : _mark,
        icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Icon(Icons.where_to_vote_rounded),
        label: Text(l10n.tripArrivedButton),
      ),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_error!, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w700))),
    ]);
  }
}

/// Sin dato del servidor (el "Llegué" salió sin señal), la foto se habilita a los 5 minutos de la llegada local.
const _proofAfterFallback = Duration(minutes: 5);

/// El cierre: el código de 4 dígitos que dice el cliente. Si no lo da, la entrega con foto tras unos minutos en el
/// punto (o enseguida si se acabaron los intentos). Las dos dejan al domiciliario libre.
class _HandoverCard extends ConsumerStatefulWidget {
  const _HandoverCard({required this.trip, required this.arrivalQueued});

  final Trip trip;
  final bool arrivalQueued;

  @override
  ConsumerState<_HandoverCard> createState() => _HandoverCardState();
}

class _HandoverCardState extends ConsumerState<_HandoverCard> {
  final _code = TextEditingController();
  final _focus = FocusNode();
  Timer? _tick;
  ReceiptPhoto? _photo;
  bool _busy = false;
  String? _error;
  int? _attemptsLeft;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _proofAt != null && DateTime.now().isBefore(_proofAt!.add(const Duration(seconds: 1)))) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _code.dispose();
    _focus.dispose();
    super.dispose();
  }

  int get _left => _attemptsLeft ?? widget.trip.delivery?.codeAttemptsLeft ?? 5;

  DateTime? get _proofAt {
    final fromServer = widget.trip.delivery?.proofAvailableAt;
    if (fromServer != null && !widget.arrivalQueued) return _left <= 0 ? DateTime.now() : fromServer;
    final local = ref.read(pendingStepsProvider).of(widget.trip.code).where((s) => s.kind == StepKind.arrived).firstOrNull?.occurredAt;
    return (local ?? widget.trip.delivery?.arrivedAt ?? DateTime.now()).add(_proofAfterFallback);
  }

  Future<void> _deliver() async {
    final l10n = AppLocalizations.of(context);
    if (_code.text.length != 4) {
      _focus.requestFocus();
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(pendingStepsProvider.notifier).deliverWithCode(widget.trip.code, _code.text);
      if (mounted) _deliveredNotice(context);
    } catch (error) {
      if (!mounted) return;
      final failure = error is Failure ? error : null;
      setState(() {
        if (failure?.code == 'DELIVERY_CODE_WRONG') _attemptsLeft = (failure!.details['attemptsLeft'] as num?)?.toInt();
        if (failure?.code == 'DELIVERY_CODE_LOCKED') _attemptsLeft = 0;
        _error = failure != null && !PendingRules.retryable(failure) ? errorText(l10n, error) : l10n.tripCodeNeedsSignal;
        _code.clear();
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _capture() async {
    final photo = await captureReceipt();
    if (photo != null && mounted) setState(() => _photo = photo);
  }

  Future<void> _sendProof() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final sent = await ref.read(pendingStepsProvider.notifier).submit(orderCode: widget.trip.code, kind: StepKind.proof, receipt: _photo);
      if (mounted) sent ? _deliveredNotice(context) : _queuedNotice(context);
    } catch (error) {
      if (mounted) setState(() => _error = errorText(l10n, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locked = _left <= 0;
    // H10.2: el código cierra el pedido, así que primero se dice cómo pagó (la foto no espera: el cliente no está).
    final collected = collectedPayments(ref.watch(pendingStepsProvider), widget.trip.code, widget.trip.collection) != null;
    final proofAt = _proofAt;
    final wait = proofAt?.difference(DateTime.now());
    final proofReady = locked || wait == null || wait <= Duration.zero;
    return DutyCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: AppColors.leaf, borderRadius: BorderRadius.circular(13)),
            child: const Icon(Icons.pin_rounded, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l10n.tripHandoverTitle, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900, letterSpacing: -0.3)),
              Text(l10n.tripHandoverHint, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.6))),
            ]),
          ),
        ]),
        if (!locked && !collected) ...[
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(14)),
            child: Row(children: [
              const Icon(Icons.point_of_sale_rounded, color: AppColors.chonta, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(l10n.tripCollectFirst, style: const TextStyle(fontWeight: FontWeight.w700))),
            ]),
          ),
        ],
        if (!locked && collected) ...[
          const SizedBox(height: 16),
          _CodeBoxes(controller: _code, focusNode: _focus, error: _error != null && _attemptsLeft != null, onComplete: _busy ? null : _deliver),
          const SizedBox(height: 8),
          Text(
            l10n.tripCodeAttempts(_left),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _left <= 2 ? AppColors.chontaStrong : AppColors.ink.withValues(alpha: 0.5)),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(58), backgroundColor: AppColors.leaf, foregroundColor: Colors.white),
            onPressed: _busy ? null : _deliver,
            icon: _busy && _photo == null
                ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                : const Icon(Icons.verified_rounded),
            label: Text(l10n.tripDeliver),
          ),
        ],
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Semantics(liveRegion: true, child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w800))),
          ),
        const SizedBox(height: 18),
        // Perforación del tiquete: arriba lo normal, abajo la salida cuando el cliente no aparece.
        Row(children: List.generate(28, (i) => Expanded(child: Container(height: 1.5, margin: const EdgeInsets.symmetric(horizontal: 2), color: AppColors.ink.withValues(alpha: 0.15))))),
        const SizedBox(height: 14),
        Text(l10n.tripNoCodeTitle, style: const TextStyle(fontWeight: FontWeight.w900)),
        const SizedBox(height: 2),
        Text(l10n.tripNoCodeBody, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.6))),
        const SizedBox(height: 12),
        if (_photo != null) ...[
          SizedBox(height: 170, child: ReceiptTile(photo: _photo, onCapture: _capture)),
          const SizedBox(height: 10),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54), backgroundColor: AppColors.ink, foregroundColor: AppColors.brand),
            onPressed: _busy ? null : _sendProof,
            icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.brand)) : const Icon(Icons.task_alt_rounded),
            label: Text(l10n.tripProofSend),
          ),
        ] else
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: proofReady && !_busy ? _capture : null,
            icon: Icon(proofReady ? Icons.photo_camera_rounded : Icons.timer_outlined),
            label: Text(proofReady ? l10n.tripProofTake : l10n.tripProofIn(_clock(wait))),
          ),
        if (_photo == null && proofReady)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(l10n.tripProofHint, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.5))),
          ),
      ]),
    );
  }
}

/// "4:05": minutos y segundos que faltan.
String _clock(Duration left) {
  final seconds = left.inSeconds.clamp(0, 99 * 60);
  return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
}

/// Cuatro casillas grandes, como las de un tiquete. Debajo hay un campo invisible que recibe el teclado numérico.
class _CodeBoxes extends StatelessWidget {
  const _CodeBoxes({required this.controller, required this.focusNode, required this.error, this.onComplete});

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool error;
  final VoidCallback? onComplete;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Semantics(
      label: l10n.tripHandoverTitle,
      textField: true,
      child: Stack(children: [
        ListenableBuilder(
          listenable: Listenable.merge([controller, focusNode]),
          builder: (context, _) {
            final text = controller.text;
            return Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 0; i < 4; i++)
                Container(
                  width: 62,
                  height: 72,
                  margin: const EdgeInsets.symmetric(horizontal: 5),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: i < text.length ? AppColors.cream : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      width: 2.5,
                      color: error && text.isEmpty
                          ? AppColors.chontaStrong
                          : focusNode.hasFocus && i == text.length
                              ? AppColors.chonta
                              : AppColors.ink.withValues(alpha: i < text.length ? 0.85 : 0.18),
                    ),
                  ),
                  child: Text(i < text.length ? text[i] : '', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900)),
                ),
            ]);
          },
        ),
        Positioned.fill(
          child: Opacity(
            opacity: 0,
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
              showCursor: false,
              enableInteractiveSelection: false,
              decoration: const InputDecoration(border: InputBorder.none, filled: false, counterText: ''),
              onChanged: (value) {
                if (value.length == 4) onComplete?.call();
              },
            ),
          ),
        ),
      ]),
    );
  }
}

void _deliveredNotice(BuildContext context) {
  final l10n = AppLocalizations.of(context);
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(behavior: SnackBarBehavior.floating, backgroundColor: AppColors.leaf, content: Text(l10n.tripDeliveredToast)));
}

/// Estados que llegan en E09–E10 (decisión del cliente, revisión, novedad): su texto de la ruta del cliente.
class _OtherStage extends StatelessWidget {
  const _OtherStage({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final body = statusBody(l10n, status);
    return DutyCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        StatusBadge(status: status, large: true),
        if (body != null) ...[const SizedBox(height: 10), Text(body)],
      ]),
    );
  }
}
