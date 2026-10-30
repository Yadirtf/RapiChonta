import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../../establishments/presentation/format/money.dart';
import '../../../orders/presentation/widgets/order_visuals.dart';
import '../../../orders/presentation/widgets/store_page.dart';
import '../../domain/cash_box.dart';
import '../courier_providers.dart';
import '../widgets/cash_box_widgets.dart';
import '../widgets/duty_widgets.dart';

/// H11.4: la caja del día del domiciliario, como el sobre que entrega en la oficina. Arriba lo que debe entregar
/// (o lo que le deben), luego la cuenta que lo explica y la libreta con cada movimiento. Solo ve la suya: la API
/// la busca por su sesión, nunca por un id que mande la app.
class CashBoxPage extends ConsumerStatefulWidget {
  const CashBoxPage({super.key});

  @override
  ConsumerState<CashBoxPage> createState() => _CashBoxPageState();
}

class _CashBoxPageState extends ConsumerState<CashBoxPage> {
  /// Nulo es hoy; si no, el día elegido (AAAA-MM-DD).
  String? _date;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final day = ref.watch(courierCashDayProvider(_date));
    final today = day.value?.today ?? ref.watch(courierCashDayProvider(null)).value?.today;

    return Scaffold(
      body: RefreshIndicator(
        color: AppColors.chonta,
        onRefresh: () => ref.refresh(courierCashDayProvider(_date).future),
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            StoreHeader(title: l10n.cashTitle, backTo: '/turno', backLabel: l10n.cashBackToShift),
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 640),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (today != null) ...[_DayChips(today: today, selected: _date, onChanged: (date) => setState(() => _date = date)), const SizedBox(height: 14)],
                    ...day.when(
                      skipLoadingOnRefresh: true,
                      loading: () => [const Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator(color: AppColors.chonta)))],
                      error: (error, _) => [
                        DoorCard(
                          icon: Icons.cloud_off_rounded,
                          title: l10n.cashLoadError,
                          body: errorText(l10n, error),
                          action: OutlinedButton(onPressed: () => ref.invalidate(courierCashDayProvider(_date)), child: Text(l10n.ordersRetry)),
                        ),
                      ],
                      data: (day) => day == null ? const [] : _content(context, day),
                    ),
                  ]),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _content(BuildContext context, CourierCashDay day) {
    final l10n = AppLocalizations.of(context);
    final box = day.box;
    return [
      if (day.awaitingBase) ...[
        _Notice(dark: true, icon: Icons.account_balance_wallet_rounded, title: l10n.cashAwaitingTitle, body: l10n.cashAwaitingBody),
        const SizedBox(height: 14),
      ] else if (day.isToday && box != null && box.closed) ...[
        _Notice(icon: Icons.lock_clock_rounded, title: l10n.cashClosedTodayTitle, body: l10n.cashClosedTodayBody),
        const SizedBox(height: 14),
      ],
      if (box == null || (box.movements.isEmpty && box.orders.isEmpty && box.uncollected.isEmpty))
        _EmptyEnvelope(mode: day.fundingMode)
      else ...[
        _Envelope(day: day, box: box),
        if (box.uncollected.isNotEmpty) ...[
          const SizedBox(height: 14),
          _Notice(icon: Icons.point_of_sale_rounded, title: l10n.cashUncollectedTitle(box.uncollected.length), body: l10n.cashUncollectedBody),
        ],
        const SizedBox(height: 18),
        _Account(box: box, fundingMode: box.fundingMode ?? day.fundingMode),
        if (box.movements.isNotEmpty) ...[const SizedBox(height: 18), _Ledger(movements: box.movements)],
        if (box.orders.isNotEmpty) ...[const SizedBox(height: 18), _Orders(orders: box.orders)],
      ],
    ];
  }
}

/// Hoy y ayer: lo que el domiciliario repasa (la caja de ayer se cierra a la mañana siguiente).
class _DayChips extends StatelessWidget {
  const _DayChips({required this.today, required this.selected, required this.onChanged});

  final String today;
  final String? selected;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final yesterday = _dayBefore(today);
    Widget chip(String label, String? value) {
      final active = selected == value || (value == null && selected == today);
      return ChoiceChip(
        label: Text(label),
        selected: active,
        showCheckmark: false,
        onSelected: (_) => onChanged(value),
        selectedColor: AppColors.ink,
        backgroundColor: Colors.white,
        labelStyle: TextStyle(fontWeight: FontWeight.w800, color: active ? AppColors.brand : AppColors.ink),
        side: BorderSide(color: active ? AppColors.ink : AppColors.ink.withValues(alpha: 0.12)),
        shape: const StadiumBorder(),
      );
    }

    return Wrap(spacing: 8, children: [chip(l10n.cashToday, null), chip(l10n.cashYesterday, yesterday)]);
  }
}

String _dayBefore(String date) {
  final d = DateTime.parse('${date}T00:00:00Z').subtract(const Duration(days: 1));
  return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

/// El sobre del día: el modo, lo que debe entregar en grande y, si ya se hizo el arqueo, el sello y quién lo hizo.
class _Envelope extends StatelessWidget {
  const _Envelope({required this.day, required this.box});

  final CourierCashDay day;
  final CashBox box;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final due = box.balance.amountDueCents;
    final look = dueLook(l10n, due);
    final closure = box.closure;
    final base = box.signedOf('OPENING');
    final collected = box.signedOf('COLLECTION');

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Kraft.top, AppColors.cream, Kraft.bottom], stops: [0, 0.38, 1]),
        border: Border.all(color: Kraft.edge),
        boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.08), blurRadius: 24, offset: const Offset(0, 10))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(children: [
        const Positioned(left: 0, right: 0, top: 0, height: 64, child: CustomPaint(painter: EnvelopeFlapPainter())),
        if (closure != null) Positioned(left: 0, right: 0, top: 36, child: Center(child: WaxSeal(label: l10n.cashSealClosed))),
        Padding(
          padding: EdgeInsets.fromLTRB(20, closure != null ? 100 : 78, 20, 18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.center, children: [
            Eyebrow(fundingModeLabel(l10n, box.fundingMode ?? day.fundingMode), color: AppColors.chontaStrong),
            const SizedBox(height: 10),
            Text(look.label, style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.ink.withValues(alpha: 0.7))),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                formatPesos(due.abs(), language),
                style: TextStyle(fontSize: 44, height: 1.1, fontWeight: FontWeight.w900, letterSpacing: -1, color: look.color),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              closure != null ? l10n.cashDueClosedBody : l10n.cashDueOpenBody,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppColors.ink.withValues(alpha: 0.6)),
            ),
            if (closure != null) ...[
              const SizedBox(height: 10),
              Text(
                l10n.cashClosedBy(closure.closedBy, orderTime(closure.closedAt, language)),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.chontaStrong),
              ),
              if (closure.notes != null) ...[
                const SizedBox(height: 4),
                Text('“${closure.notes}”', textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, fontStyle: FontStyle.italic, color: AppColors.ink.withValues(alpha: 0.7))),
              ],
            ],
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.7), borderRadius: BorderRadius.circular(16)),
              child: Row(children: [
                if (base != 0) _Mini(label: l10n.cashMoveOpening, value: formatPesos(base.abs(), language)),
                _Mini(label: l10n.cashMoveCollection, value: formatPesos(collected.abs(), language)),
                _Mini(label: l10n.cashOrdersTitle, value: '${box.balance.settledOrders}'),
              ]),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _Mini extends StatelessWidget {
  const _Mini({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(children: [
          Text(value, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
          Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: AppColors.ink.withValues(alpha: 0.55))),
        ]),
      );
}

class _EmptyEnvelope extends StatelessWidget {
  const _EmptyEnvelope({required this.mode});

  final String? mode;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(26), border: Border.all(color: Kraft.edge, width: 1.5)),
      child: Column(children: [
        const SizedBox(width: 92, height: 40, child: CustomPaint(painter: EnvelopeFlapPainter())),
        const SizedBox(height: 12),
        Eyebrow(fundingModeLabel(l10n, mode), color: AppColors.chontaStrong),
        const SizedBox(height: 6),
        Text(l10n.cashEmptyTitle, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
        Text(l10n.cashEmptyBody, textAlign: TextAlign.center, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6))),
      ]),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.title, required this.body, this.dark = false});

  final IconData icon;
  final String title;
  final String body;
  final bool dark;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(color: dark ? AppColors.ink : AppColors.chontaSoft, borderRadius: BorderRadius.circular(20)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(color: dark ? AppColors.brand : AppColors.chonta, borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: dark ? AppColors.ink : Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontWeight: FontWeight.w900, color: dark ? AppColors.brand : AppColors.chontaStrong)),
              Text(body, style: TextStyle(fontSize: 12.5, color: dark ? Colors.white70 : AppColors.ink.withValues(alpha: 0.7))),
            ]),
          ),
        ]),
      );
}

/// La cuenta como recibo: cada tipo del libro con su signo, las tarifas que son suyas y la comisión de RapiChonta.
/// La línea final es la misma que el sobre (la API la calcula de estas mismas partes).
class _Account extends StatelessWidget {
  const _Account({required this.box, required this.fundingMode});

  final CashBox box;
  final String? fundingMode;

  static const _order = ['OPENING', 'COLLECTION', 'PURCHASE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'];

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final balance = box.balance;
    final totals = [
      for (final type in _order) ...box.totals.where((t) => t.type == type),
      ...box.totals.where((t) => !_order.contains(t.type)),
    ];
    final due = dueLook(l10n, balance.amountDueCents);

    return DutyCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Eyebrow(l10n.cashAccountTitle),
        const SizedBox(height: 8),
        for (final t in totals) _AccountLine(label: _lineLabel(l10n, t.type), detail: l10n.cashTimes(t.count), value: signedPesos(t.signedCents, language), cents: t.signedCents),
        if (balance.settledOrders > 0 || balance.courierFeesCents != 0)
          _AccountLine(label: l10n.cashLineFees(balance.settledOrders), value: signedPesos(-balance.courierFeesCents, language), cents: -balance.courierFeesCents),
        if (balance.commissionsCents != 0)
          _AccountLine(label: l10n.cashLineCommissions, value: signedPesos(balance.commissionsCents, language), cents: balance.commissionsCents),
        const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: CustomPaint(size: Size(double.infinity, 1), painter: _Perforation())),
        Row(children: [
          Expanded(child: Text(due.label, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16))),
          Text(formatPesos(balance.amountDueCents.abs(), language), style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: due.color)),
        ]),
        const SizedBox(height: 8),
        Text(fundingMode == 'CASH_BOX' ? l10n.cashFormulaBase : l10n.cashFormulaOwn, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
      ]),
    );
  }
}

String _lineLabel(AppLocalizations l10n, String type) => switch (type) {
      'OPENING' => l10n.cashLineOpening,
      'PURCHASE' => l10n.cashLinePurchase,
      'COLLECTION' => l10n.cashLineCollection,
      'RETURN' => l10n.cashLineReturn,
      'ADJUSTMENT_IN' => l10n.cashLineAdjustmentIn,
      'ADJUSTMENT_OUT' => l10n.cashLineAdjustmentOut,
      _ => type,
    };

class _AccountLine extends StatelessWidget {
  const _AccountLine({required this.label, required this.value, required this.cents, this.detail});

  final String label;
  final String? detail;
  final String value;
  final int cents;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(children: [
          Expanded(
            child: Text.rich(TextSpan(children: [
              TextSpan(text: label, style: const TextStyle(fontWeight: FontWeight.w700)),
              if (detail != null) TextSpan(text: '  $detail', style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.45))),
            ])),
          ),
          Text(value, style: TextStyle(fontWeight: FontWeight.w800, fontFeatures: const [FontFeature.tabularFigures()], color: cents < 0 ? AppColors.leaf : AppColors.ink)),
        ]),
      );
}

/// El corte punteado del recibo antes del total.
class _Perforation extends CustomPainter {
  const _Perforation();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.ink.withValues(alpha: 0.25)
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;
    for (var x = 0.0; x < size.width; x += 8) {
      canvas.drawLine(Offset(x, 0), Offset(x + 3, 0), paint);
    }
  }

  @override
  bool shouldRepaint(_Perforation old) => false;
}

/// La libreta: cada movimiento en el orden del día. Los anulados quedan tachados (el libro no se borra).
class _Ledger extends StatelessWidget {
  const _Ledger({required this.movements});

  final List<CashMovement> movements;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    return DutyCard(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Eyebrow(l10n.cashLedgerTitle),
        const SizedBox(height: 6),
        for (final (i, m) in movements.indexed) ...[
          if (i > 0) Divider(height: 1, color: AppColors.ink.withValues(alpha: 0.06)),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: _tone(m.type).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                child: Icon(_icon(m.type), size: 18, color: _tone(m.type)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_moveLabel(l10n, m.type), style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text(
                    [
                      orderTime(m.createdAt, language),
                      if (m.orderCode != null) m.orderCode!,
                      if (m.paymentMethod != null) paymentLabel(l10n, m.paymentMethod!),
                    ].join(' · '),
                    style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55)),
                  ),
                  if (m.note != null) Text('“${m.note}”', style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: AppColors.ink.withValues(alpha: 0.7))),
                  if (m.reversed || m.reverses)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(color: AppColors.chontaSoft, borderRadius: BorderRadius.circular(99)),
                        child: Text(m.reversed ? l10n.cashMoveReversed : l10n.cashMoveReverses, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.chontaStrong)),
                      ),
                    ),
                ]),
              ),
              const SizedBox(width: 8),
              Text(
                signedPesos(m.signedCents, language),
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontFeatures: const [FontFeature.tabularFigures()],
                  color: m.signedCents < 0 ? AppColors.leaf : AppColors.ink,
                  decoration: m.reversed ? TextDecoration.lineThrough : null,
                ),
              ),
            ]),
          ),
        ],
      ]),
    );
  }
}

String _moveLabel(AppLocalizations l10n, String type) => switch (type) {
      'OPENING' => l10n.cashMoveOpening,
      'PURCHASE' => l10n.cashMovePurchase,
      'COLLECTION' => l10n.cashMoveCollection,
      'RETURN' => l10n.cashMoveReturn,
      'ADJUSTMENT_IN' || 'ADJUSTMENT_OUT' => l10n.cashMoveAdjustment,
      _ => type,
    };

IconData _icon(String type) => switch (type) {
      'OPENING' => Icons.account_balance_wallet_rounded,
      'PURCHASE' => Icons.storefront_rounded,
      'COLLECTION' => Icons.payments_rounded,
      'RETURN' => Icons.move_to_inbox_rounded,
      _ => Icons.edit_note_rounded,
    };

Color _tone(String type) => switch (type) {
      'OPENING' => AppColors.brandStrong,
      'PURCHASE' => AppColors.leaf,
      'COLLECTION' => AppColors.chonta,
      'RETURN' => AppColors.ink,
      _ => AppColors.chontaStrong,
    };

/// Los pedidos liquidados en esta caja: la tarifa (suya) y la comisión (de RapiChonta) de cada uno.
class _Orders extends StatelessWidget {
  const _Orders({required this.orders});

  final List<CashOrder> orders;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    return DutyCard(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Eyebrow(l10n.cashOrdersTitle),
        const SizedBox(height: 6),
        for (final o in orders)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(children: [
              Text(o.code, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w900, letterSpacing: 1)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(o.storeName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(
                    o.counted ? l10n.cashOrderLine(formatPesos(o.feeCents, language), formatPesos(o.commissionCents, language)) : l10n.cashOrderNotCounted,
                    style: TextStyle(fontSize: 12, color: o.counted ? AppColors.ink.withValues(alpha: 0.55) : AppColors.chontaStrong),
                  ),
                ]),
              ),
            ]),
          ),
      ]),
    );
  }
}
