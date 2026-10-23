import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../core/error/failure.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../../establishments/presentation/format/money.dart';
import '../../../orders/domain/entities/adjustment.dart';
import '../../../orders/presentation/widgets/countdown.dart';
import '../../domain/courier.dart';
import '../../domain/pending_steps.dart';
import '../courier_providers.dart';
import 'duty_widgets.dart';

/// "38.500" mientras escribe (solo dígitos; el punto o la coma de miles según el idioma).
class PesosFormatter extends TextInputFormatter {
  PesosFormatter(this.language);

  final String language;

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^0+(?=\d)'), '');
    if (digits.isEmpty) return const TextEditingValue();
    final grouped = digits.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => language == 'en' ? ',' : '.');
    return TextEditingValue(text: grouped, selection: TextSelection.collapsed(offset: grouped.length));
  }
}

int? _pesos(String text) {
  final value = int.tryParse(text.replaceAll(RegExp(r'\D'), ''));
  return value == null || value <= 0 ? null : value;
}

/// H09.2, en el local: "Falta algo o cambió un precio". Abre la hoja para marcar las líneas con problema.
class ReportProblemButton extends StatelessWidget {
  const ReportProblemButton({super.key, required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: AppColors.chontaStrong,
        side: BorderSide(color: AppColors.chonta.withValues(alpha: 0.5), width: 2),
      ),
      onPressed: () => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: AppColors.surface,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        builder: (context) => _ReportSheet(trip: trip),
      ),
      icon: const Icon(Icons.report_gmailerrorred_rounded),
      label: Text(l10n.tripReportOpen, style: const TextStyle(fontWeight: FontWeight.w800)),
    );
  }
}

/// Lo marcado para una línea: el motivo y, con "otro precio", lo que escribe.
class _Mark {
  _Mark(this.reason);

  String reason;
  final price = TextEditingController();
}

/// Todas las líneas con problema van en una sola pregunta: se marca cada una (no hay / otro precio) y se envía.
class _ReportSheet extends ConsumerStatefulWidget {
  const _ReportSheet({required this.trip});

  final Trip trip;

  @override
  ConsumerState<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends ConsumerState<_ReportSheet> {
  final _marks = <String, _Mark>{};
  bool _busy = false;
  bool _tried = false;
  String? _error;

  @override
  void dispose() {
    for (final m in _marks.values) {
      m.price.dispose();
    }
    super.dispose();
  }

  List<ReportedLine> get _lines => [
        for (final MapEntry(key: id, value: mark) in _marks.entries)
          ReportedLine(orderItemId: id, reason: mark.reason, unitPesos: mark.reason == AdjustmentReasons.priceChanged ? _pesos(mark.price.text) : null),
      ];

  Map<String, int> get _prices => {for (final l in widget.trip.lines) if (l.id != null) l.id!: l.unitCents};

  void _toggle(String id, String reason) => setState(() {
        final mark = _marks[id];
        if (mark == null) {
          _marks[id] = _Mark(reason);
        } else if (mark.reason == reason) {
          _marks.remove(id)?.price.dispose();
        } else {
          mark.reason = reason;
        }
      });

  Future<void> _send() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _tried = true);
    final lines = _lines;
    if (AdjustmentRules.reportProblem(lines, _prices) != null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(pendingStepsProvider.notifier).reportAdjustment(widget.trip.code, lines);
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (!mounted) return;
      final failure = error is Failure ? error : null;
      setState(() => _error = failure == null || PendingRules.retryable(failure) ? l10n.tripReportNeedsSignal : errorText(l10n, failure));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final lines = widget.trip.lines.where((l) => l.id != null).toList();
    final count = _marks.length;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.92),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 12, 4),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Center(child: Container(width: 44, height: 5, decoration: BoxDecoration(color: AppColors.ink.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(99)))),
              const SizedBox(height: 12),
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Eyebrow(widget.trip.storeName),
                    const SizedBox(height: 4),
                    Text(l10n.tripReportTitle, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                    const SizedBox(height: 4),
                    Text(l10n.tripReportBody, style: TextStyle(fontSize: 13, color: AppColors.ink.withValues(alpha: 0.6))),
                  ]),
                ),
                IconButton(tooltip: l10n.close, onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
              ]),
            ]),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
              children: [
                for (final line in lines)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _MarkLine(
                      line: line,
                      mark: _marks[line.id!],
                      tried: _tried,
                      language: language,
                      onToggle: (reason) => _toggle(line.id!, reason),
                      onPrice: () => setState(() {}),
                    ),
                  ),
              ],
            ),
          ),
          Container(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 14 + MediaQuery.paddingOf(context).bottom),
            decoration: BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.08), blurRadius: 16, offset: const Offset(0, -6))]),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Semantics(liveRegion: true, child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w800))),
                ),
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(58), backgroundColor: AppColors.ink, foregroundColor: AppColors.brand),
                onPressed: _busy || count == 0 ? null : _send,
                icon: _busy
                    ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.brand))
                    : const Icon(Icons.forum_rounded),
                label: Text(l10n.tripReportSend(count)),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _MarkLine extends StatelessWidget {
  const _MarkLine({required this.line, required this.mark, required this.tried, required this.language, required this.onToggle, required this.onPrice});

  final TripLine line;
  final _Mark? mark;
  final bool tried;
  final String language;
  final ValueChanged<String> onToggle;
  final VoidCallback onPrice;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final reason = mark?.reason;
    final priced = reason == AdjustmentReasons.priceChanged;
    final pesos = priced ? _pesos(mark!.price.text) : null;
    final priceError = !priced || !tried
        ? null
        : pesos == null
            ? l10n.tripReportPriceMissing
            : (pesos * 100 == line.unitCents ? l10n.tripReportPriceSame : null);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: reason == null ? Colors.transparent : (priced ? AppColors.brand : AppColors.chonta), width: 2),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 34, child: Text('${line.quantity}×', style: const TextStyle(color: AppColors.chonta, fontWeight: FontWeight.w900, fontSize: 16))),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                line.name,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  decoration: reason == AdjustmentReasons.unavailable ? TextDecoration.lineThrough : null,
                  decorationColor: AppColors.chonta,
                ),
              ),
              Text(l10n.adjPerUnit(formatPesos(line.unitCents, language)), style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
            ]),
          ),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: _ReasonChip(
              label: l10n.tripReportUnavailable,
              icon: Icons.remove_shopping_cart_rounded,
              selected: reason == AdjustmentReasons.unavailable,
              fill: AppColors.chonta,
              ink: Colors.white,
              onTap: () => onToggle(AdjustmentReasons.unavailable),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _ReasonChip(
              label: l10n.tripReportPriceChanged,
              icon: Icons.sell_rounded,
              selected: priced,
              fill: AppColors.brand,
              ink: AppColors.ink,
              onTap: () => onToggle(AdjustmentReasons.priceChanged),
            ),
          ),
        ]),
        if (priced) ...[
          const SizedBox(height: 10),
          TextField(
            controller: mark!.price,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9), PesosFormatter(language)],
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
            onChanged: (_) => onPrice(),
            decoration: InputDecoration(
              labelText: l10n.tripReportNewPrice,
              helperText: l10n.tripReportWas(formatPesos(line.unitCents, language)),
              errorText: priceError,
              prefixIcon: const Padding(
                padding: EdgeInsets.only(left: 16, right: 6),
                child: Text('\$', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: AppColors.chonta)),
              ),
              prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
            ),
          ),
        ],
      ]),
    );
  }
}

class _ReasonChip extends StatelessWidget {
  const _ReasonChip({required this.label, required this.icon, required this.selected, required this.fill, required this.ink, required this.onTap});

  final String label;
  final IconData icon;
  final bool selected;
  final Color fill;
  final Color ink;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        selected: selected,
        button: true,
        child: Material(
          color: selected ? fill : AppColors.cream,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(selected ? Icons.check_rounded : icon, size: 18, color: selected ? ink : AppColors.ink.withValues(alpha: 0.6)),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w800, color: selected ? ink : AppColors.ink)),
                ),
              ]),
            ),
          ),
        ),
      );
}

/// AWAITING_CUSTOMER: la pregunta salió. El reloj del cliente, lo que ya respondió línea por línea y lo que falta.
class WaitingCustomerStage extends StatelessWidget {
  const WaitingCustomerStage({super.key, required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final adjustment = trip.adjustment;
    if (adjustment == null) return const SizedBox.shrink();
    return DutyCard(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
      child: CountdownBuilder(
        until: adjustment.expiresAt,
        builder: (context, left) {
          final span = adjustment.span.inMilliseconds;
          final fraction = span <= 0 ? 0.0 : left.inMilliseconds / span;
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Eyebrow(trip.storeName),
            const SizedBox(height: 4),
            Text(l10n.tripWaitingTitle, textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
            const SizedBox(height: 14),
            Center(
              child: Semantics(
                label: l10n.tripWaitingLeft(mmss(left)),
                child: CountdownRing(
                  size: 132,
                  stroke: 10,
                  fraction: fraction,
                  urgent: left <= const Duration(seconds: 45),
                  child: ExcludeSemantics(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.forum_rounded, color: AppColors.chonta, size: 24),
                      Text(mmss(left), style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: -1, fontFeatures: [FontFeature.tabularFigures()])),
                    ]),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(l10n.tripWaitingBody(adjustment.lines.length), textAlign: TextAlign.center, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.7))),
            const SizedBox(height: 14),
            for (final line in adjustment.lines) _AskedLine(line: line),
            const SizedBox(height: 8),
            Text(l10n.tripWaitingTimeout, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.5))),
          ]);
        },
      ),
    );
  }
}

/// En el local, de vuelta a comprar: lo que respondió el cliente a la última pregunta.
class CustomerDecisionCard extends StatelessWidget {
  const CustomerDecisionCard({super.key, required this.adjustment});

  final OrderAdjustment adjustment;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.leaf, borderRadius: BorderRadius.circular(22)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Icon(Icons.mark_chat_read_rounded, color: Colors.white, size: 24),
            const SizedBox(width: 10),
            Expanded(child: Text(l10n.tripDecisionTitle, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900))),
          ]),
          const SizedBox(height: 10),
          for (final line in adjustment.lines) _AskedLine(line: line, onDark: true),
        ]),
      ),
    );
  }
}

/// Una línea preguntada: el producto y lo que hay que hacer con él (o que aún falta la respuesta).
class _AskedLine extends StatelessWidget {
  const _AskedLine({required this.line, this.onDark = false});

  final AdjustmentLine line;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final substitute = line.substitute;
    final (icon, text, tone) = switch (line.decision) {
      null => (Icons.more_horiz_rounded, l10n.tripWaitingPending, AppColors.chonta),
      AdjustmentDecisions.substitute when substitute != null => (Icons.swap_horiz_rounded, l10n.tripDecisionSubstitute(substitute.quantity, substitute.name), AppColors.ink),
      AdjustmentDecisions.acceptPrice => (Icons.verified_rounded, l10n.tripDecisionAcceptPrice, AppColors.leaf),
      AdjustmentDecisions.expiredRemoved => (Icons.timer_off_rounded, l10n.tripDecisionExpired, AppColors.chontaStrong),
      _ => (Icons.block_rounded, l10n.tripDecisionRemove, AppColors.chontaStrong),
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: onDark ? Colors.white : AppColors.cream, borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${line.quantity}× ${line.name}', style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Row(children: [
              Icon(icon, size: 15, color: tone),
              const SizedBox(width: 5),
              Flexible(child: Text(text, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: tone))),
            ]),
          ]),
        ),
      ]),
    );
  }
}
