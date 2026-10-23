import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../../establishments/presentation/format/money.dart';
import '../../domain/entities/adjustment.dart';
import '../../domain/entities/order.dart';
import '../providers/orders_providers.dart';
import 'countdown.dart';

/// Menos que esto, la mecha se pone roja: hay que decidir ya.
const _hurry = Duration(seconds: 45);

/// Tras consumirse la mecha, el reloj de la API quita lo pendiente; se vuelve a pedir el pedido para verlo.
const _afterExpiry = Duration(milliseconds: 2500);

/// "+$500" / "−$12.000" / "=".
String _signed(int cents, String language) => cents == 0 ? '=' : '${cents > 0 ? '+' : '−'}${formatPesos(cents.abs(), language)}';

/// H09.3: la pregunta del domiciliario desde el local. No es un chat: cada producto trae solo sus opciones cerradas
/// y una mecha que se consume con el tiempo que queda. Si se acaba, lo pendiente se quita y la compra sigue.
class AdjustmentDesk extends ConsumerStatefulWidget {
  const AdjustmentDesk({super.key, required this.order, required this.adjustment, required this.detailKey});

  final OrderDetail order;
  final OrderAdjustment adjustment;
  final (String, String) detailKey;

  @override
  ConsumerState<AdjustmentDesk> createState() => _AdjustmentDeskState();
}

class _AdjustmentDeskState extends ConsumerState<AdjustmentDesk> {
  bool _busy = false;
  Timer? _reload;

  @override
  void dispose() {
    _reload?.cancel();
    super.dispose();
  }

  void _changed() {
    ref.invalidate(orderDetailProvider(widget.detailKey));
    ref.invalidate(myOrdersProvider);
  }

  /// Una decisión: la línea [line] con [decision]. Si falla (otra pestaña ya decidió, venció), se recarga igual.
  Future<String?> _decide(AdjustmentLine line, String decision, {String? productVersionId}) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      await ref.read(orderRepositoryProvider).decideAdjustment(widget.order.code, line.id, decision: decision, productVersionId: productVersionId);
      return null;
    } catch (error) {
      return errorText(l10n, error);
    } finally {
      if (mounted) setState(() => _busy = false);
      _changed();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final adjustment = widget.adjustment;
    final pending = adjustment.pending.toList();
    return CountdownBuilder(
      until: adjustment.expiresAt,
      builder: (context, left) {
        final expired = left == Duration.zero;
        if (expired && _reload == null) _reload = Timer(_afterExpiry, _changed);
        final ratio = adjustment.span.inMilliseconds <= 0 ? 0.0 : (left.inMilliseconds / adjustment.span.inMilliseconds).clamp(0.0, 1.0);
        return Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: AppColors.chonta, width: 2),
            boxShadow: [BoxShadow(color: AppColors.chonta.withValues(alpha: 0.28), blurRadius: 32, offset: const Offset(0, 16))],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              color: AppColors.ink,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 18, 16, 20),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(l10n.adjKicker.toUpperCase(), style: const TextStyle(color: AppColors.brand, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.8)),
                        const SizedBox(height: 6),
                        Semantics(
                          header: true,
                          liveRegion: true,
                          child: Text(
                            l10n.adjTitle(math.max(1, pending.length), widget.order.establishmentName),
                            style: const TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w900, height: 1.15, letterSpacing: -0.4),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(l10n.adjBody, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                      ]),
                    ),
                    const SizedBox(width: 12),
                    _FuseClock(left: left, ratio: ratio),
                  ]),
                ),
                _Fuse(ratio: ratio),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 14, 12, 4),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (final line in adjustment.lines)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _LineQuestion(
                      order: widget.order,
                      line: line,
                      locked: _busy || expired,
                      onDecide: (decision, {productVersionId}) => _decide(line, decision, productVersionId: productVersionId),
                    ),
                  ),
              ]),
            ),
            const _Perforation(),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 12, 10, 14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Padding(padding: EdgeInsets.only(top: 1), child: Icon(Icons.hourglass_bottom_rounded, size: 16, color: AppColors.chonta)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(expired ? l10n.adjTimeoutNow : l10n.adjTimeoutRule, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.6))),
                  ),
                ]),
                if (pending.isNotEmpty && !expired)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      style: TextButton.styleFrom(foregroundColor: AppColors.chontaStrong),
                      onPressed: _busy ? null : () => _confirmCancel(pending.first),
                      icon: const Icon(Icons.cancel_outlined, size: 18),
                      label: Text(l10n.adjCancelOrder, style: const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
              ]),
            ),
          ]),
        );
      },
    );
  }

  /// Cancelar todo responde por toda la pregunta: va aparte y con confirmación.
  Future<void> _confirmCancel(AdjustmentLine line) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.adjCancelTitle, style: const TextStyle(fontWeight: FontWeight.w900)),
        content: Text(l10n.adjCancelBody(widget.order.establishmentName)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.adjKeepOrder)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.ink, foregroundColor: AppColors.brand),
            onPressed: () => Navigator.pop(context, true),
            child: Text(l10n.adjCancelConfirm),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final error = await _decide(line, AdjustmentDecisions.cancelOrder);
    if (error != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(behavior: SnackBarBehavior.floating, content: Text(error)));
    }
  }
}

/// Reloj redondo con lo que queda (m:ss): amarillo, y chontaduro en el último tramo.
class _FuseClock extends StatelessWidget {
  const _FuseClock({required this.left, required this.ratio});

  final Duration left;
  final double ratio;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final color = left <= _hurry ? AppColors.chonta : AppColors.brand;
    return Semantics(
      label: l10n.adjTimeLeft(mmss(left)),
      child: ExcludeSemantics(
        child: SizedBox.square(
          dimension: 68,
          child: CustomPaint(
            painter: _ArcPainter(ratio: ratio, color: color),
            child: Center(
              child: Text(mmss(left), style: TextStyle(color: color, fontFamily: 'monospace', fontSize: 16, fontWeight: FontWeight.w900, fontFeatures: const [FontFeature.tabularFigures()])),
            ),
          ),
        ),
      ),
    );
  }
}

class _ArcPainter extends CustomPainter {
  const _ArcPainter({required this.ratio, required this.color});

  final double ratio;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final ring = (Offset.zero & size).deflate(4);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6;
    canvas.drawArc(ring, 0, math.pi * 2, false, paint..color = Colors.white12);
    canvas.drawArc(ring, -math.pi / 2, math.pi * 2 * ratio, false, paint
      ..color = color
      ..strokeCap = StrokeCap.round);
  }

  @override
  bool shouldRepaint(_ArcPainter old) => old.ratio != ratio || old.color != color;
}

/// La mecha: una línea que se consume de derecha a izquierda, con la chispa en la punta.
class _Fuse extends StatelessWidget {
  const _Fuse({required this.ratio});

  final double ratio;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 6,
        child: LayoutBuilder(
          builder: (context, constraints) => Stack(clipBehavior: Clip.none, children: [
            Positioned.fill(child: Container(color: Colors.white10)),
            AnimatedContainer(
              duration: const Duration(seconds: 1),
              width: constraints.maxWidth * ratio,
              decoration: const BoxDecoration(gradient: LinearGradient(colors: [AppColors.chonta, AppColors.brand])),
            ),
            if (ratio > 0)
              AnimatedPositioned(
                duration: const Duration(seconds: 1),
                left: constraints.maxWidth * ratio - 6,
                top: -3,
                child: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: AppColors.brand,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: AppColors.brand.withValues(alpha: 0.8), blurRadius: 8, spreadRadius: 1)],
                  ),
                ),
              ),
          ]),
        ),
      );
}

/// Perforación de la comanda: arriba lo que se decide, abajo la regla del tiempo.
class _Perforation extends StatelessWidget {
  const _Perforation();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(children: List.generate(28, (_) => Expanded(child: Container(height: 1.5, margin: const EdgeInsets.symmetric(horizontal: 2), color: AppColors.ink.withValues(alpha: 0.14))))),
      );
}

typedef _Decide = Future<String?> Function(String decision, {String? productVersionId});

/// Una línea con problema: qué pasó y sus opciones; o, si ya decidió, lo que eligió.
class _LineQuestion extends StatefulWidget {
  const _LineQuestion({required this.order, required this.line, required this.locked, required this.onDecide});

  final OrderDetail order;
  final AdjustmentLine line;
  final bool locked;
  final _Decide onDecide;

  @override
  State<_LineQuestion> createState() => _LineQuestionState();
}

class _LineQuestionState extends State<_LineQuestion> {
  String? _error;

  Future<void> _choose(String option) async {
    if (option == AdjustmentDecisions.substitute) {
      final picked = await showSubstitutePicker(context, order: widget.order, line: widget.line);
      if (picked == null || !mounted) return;
      final error = await widget.onDecide(option, productVersionId: picked.productVersionId);
      if (mounted) setState(() => _error = error);
      return;
    }
    final error = await widget.onDecide(option);
    if (mounted) setState(() => _error = error);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final line = widget.line;
    final unavailable = line.reason != AdjustmentReasons.priceChanged || line.reportedUnitCents == null;
    final decided = !line.pending;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: decided ? AppColors.cream.withValues(alpha: 0.7) : Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: decided ? AppColors.ink.withValues(alpha: 0.05) : AppColors.chonta.withValues(alpha: 0.4), width: 2),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Transform.rotate(
            angle: unavailable ? -0.1 : 0.05,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: unavailable ? AppColors.chonta : AppColors.brand, borderRadius: BorderRadius.circular(15)),
              child: Icon(unavailable ? Icons.remove_shopping_cart_rounded : Icons.sell_rounded, color: unavailable ? Colors.white : AppColors.ink, size: 22),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text.rich(
                TextSpan(children: [
                  TextSpan(text: '${line.quantity}× ', style: const TextStyle(color: AppColors.chonta)),
                  TextSpan(text: line.name),
                ]),
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, height: 1.2),
              ),
              const SizedBox(height: 3),
              if (unavailable)
                Text(l10n.adjReasonUnavailable, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.chontaStrong))
              else
                Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.end, children: [
                  Text(l10n.adjReasonPriceChanged, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.ink.withValues(alpha: 0.6))),
                  Text(
                    formatPesos(line.unitCents, language),
                    style: TextStyle(fontSize: 13, color: AppColors.ink.withValues(alpha: 0.4), decoration: TextDecoration.lineThrough),
                  ),
                  Text(l10n.adjPerUnit(formatPesos(line.reportedUnitCents!, language)), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.chontaStrong)),
                ]),
            ]),
          ),
        ]),
        if (decided)
          _Decided(line: line)
        else ...[
          const SizedBox(height: 12),
          for (final option in line.options.where((o) => o != AdjustmentDecisions.cancelOrder))
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: _OptionButton(option: option, line: line, enabled: !widget.locked, onTap: () => _choose(option)),
            ),
        ],
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Semantics(liveRegion: true, child: Text(_error!, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w700))),
          ),
      ]),
    );
  }
}

class _OptionButton extends StatelessWidget {
  const _OptionButton({required this.option, required this.line, required this.enabled, required this.onTap});

  final String option;
  final AdjustmentLine line;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final (icon, fill, ink, label) = switch (option) {
      AdjustmentDecisions.substitute => (Icons.swap_horiz_rounded, AppColors.brand, AppColors.ink, l10n.adjOptionSubstitute),
      AdjustmentDecisions.acceptPrice => (Icons.verified_rounded, AppColors.leaf, Colors.white, l10n.adjOptionAcceptPrice),
      AdjustmentDecisions.removeItem => (Icons.delete_outline_rounded, AppColors.cream, AppColors.ink, l10n.adjOptionRemove),
      _ => (Icons.help_outline_rounded, AppColors.cream, AppColors.ink, option),
    };
    final delta = AdjustmentRules.deltaCents(line, option);
    final hint = option == AdjustmentDecisions.substitute ? l10n.adjHintSubstitute : (delta == null ? null : _signed(delta, language));
    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: Material(
        color: fill,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: enabled ? onTap : null,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(children: [
                Icon(icon, color: ink, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(label, style: TextStyle(color: ink, fontWeight: FontWeight.w800, fontSize: 15)),
                    if (hint != null)
                      Text(hint, style: TextStyle(color: ink.withValues(alpha: 0.7), fontWeight: FontWeight.w700, fontSize: 12.5, fontFeatures: const [FontFeature.tabularFigures()])),
                  ]),
                ),
                Icon(Icons.chevron_right_rounded, color: ink.withValues(alpha: 0.45)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// Lo que eligió (o lo que pasó al acabarse el tiempo).
class _Decided extends StatelessWidget {
  const _Decided({required this.line});

  final AdjustmentLine line;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final substitute = line.substitute;
    final text = switch (line.decision) {
      AdjustmentDecisions.substitute when substitute != null => l10n.adjDecidedSubstitute(substitute.name, formatPesos(substitute.unitCents, language)),
      AdjustmentDecisions.removeItem => l10n.adjDecidedRemove,
      AdjustmentDecisions.acceptPrice => l10n.adjDecidedAcceptPrice,
      AdjustmentDecisions.cancelOrder => l10n.adjDecidedCancel,
      AdjustmentDecisions.expiredRemoved => l10n.adjDecidedExpired,
      final other => other ?? '',
    };
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
      child: Row(children: [
        const Icon(Icons.check_circle_rounded, size: 18, color: AppColors.leaf),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: const TextStyle(color: AppColors.leaf, fontWeight: FontWeight.w800))),
      ]),
    );
  }
}

/// "Cambiar por": hoja con lo del mismo local, primero lo de la misma sección y precio parecido (lo ordena la
/// API). Devuelve el elegido, o null si la cierra.
Future<SubstituteOption?> showSubstitutePicker(BuildContext context, {required OrderDetail order, required AdjustmentLine line}) =>
    showModalBottomSheet<SubstituteOption>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.82,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scroll) => _SubstitutePicker(order: order, line: line, scroll: scroll),
      ),
    );

class _SubstitutePicker extends ConsumerStatefulWidget {
  const _SubstitutePicker({required this.order, required this.line, required this.scroll});

  final OrderDetail order;
  final AdjustmentLine line;
  final ScrollController scroll;

  @override
  ConsumerState<_SubstitutePicker> createState() => _SubstitutePickerState();
}

class _SubstitutePickerState extends ConsumerState<_SubstitutePicker> {
  late Future<List<SubstituteOption>> _items;
  bool _loaded = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loaded) return;
    _loaded = true;
    final language = Localizations.localeOf(context).languageCode;
    _items = ref.read(orderRepositoryProvider).substitutes(widget.order.code, widget.line.id, language: language);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final line = widget.line;
    return FutureBuilder<List<SubstituteOption>>(
      future: _items,
      builder: (context, snapshot) {
        final items = snapshot.data;
        final groups = items == null ? const <List<SubstituteOption>>[] : [items.where((i) => i.sameSection).toList(), items.where((i) => !i.sameSection).toList()];
        return CustomScrollView(controller: widget.scroll, slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 12, 8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Center(child: Container(width: 44, height: 5, decoration: BoxDecoration(color: AppColors.ink.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(99)))),
                const SizedBox(height: 12),
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(l10n.adjPickTitle(line.name), style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900, letterSpacing: -0.4)),
                      const SizedBox(height: 4),
                      Text(l10n.adjPickBody(line.quantity), style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6))),
                    ]),
                  ),
                  IconButton(tooltip: l10n.close, onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
                ]),
              ]),
            ),
          ),
          if (snapshot.hasError)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Text(errorText(l10n, snapshot.error!), style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w700)),
              ),
            ),
          if (items == null && !snapshot.hasError)
            const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(color: AppColors.chonta))))
          else if ((items ?? const []).isEmpty)
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.all(20),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
                decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(22)),
                child: Column(children: [
                  const Icon(Icons.block_rounded, size: 34, color: AppColors.chonta),
                  const SizedBox(height: 10),
                  Text(l10n.adjPickEmpty, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  Text(l10n.adjPickEmptyBody, textAlign: TextAlign.center, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6))),
                ]),
              ),
            )
          else
            for (var g = 0; g < groups.length; g++)
              if (groups[g].isNotEmpty) ...[
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 14, 20, 10),
                    child: Text(
                      (g == 0 ? l10n.adjPickSimilar : l10n.adjPickOthers).toUpperCase(),
                      style: const TextStyle(color: AppColors.chonta, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.8),
                    ),
                  ),
                ),
                // Columnas de ~200 px; cada tarjeta toma la altura de su texto (nombres largos, letra grande).
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  sliver: SliverToBoxAdapter(
                    child: LayoutBuilder(builder: (context, constraints) {
                      final columns = math.max(2, (constraints.maxWidth / 200).floor());
                      final width = (constraints.maxWidth - 12 * (columns - 1)) / columns;
                      return Wrap(spacing: 12, runSpacing: 12, children: [
                        for (final option in groups[g]) SizedBox(width: width, child: _SubstituteCard(line: line, option: option)),
                      ]);
                    }),
                  ),
                ),
              ],
          SliverToBoxAdapter(child: SizedBox(height: 24 + MediaQuery.paddingOf(context).bottom)),
        ]);
      },
    );
  }
}

class _SubstituteCard extends StatelessWidget {
  const _SubstituteCard({required this.line, required this.option});

  final AdjustmentLine line;
  final SubstituteOption option;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final delta = AdjustmentRules.deltaCents(line, AdjustmentDecisions.substitute, substituteCents: option.priceCents) ?? 0;
    final (chipFill, chipInk) = delta > 0 ? (AppColors.ink, AppColors.brand) : (delta < 0 ? (AppColors.leaf, Colors.white) : (Colors.white, AppColors.ink));
    final placeholder = Center(
      child: Text(option.name.isEmpty ? '' : option.name.characters.first.toUpperCase(), style: TextStyle(fontSize: 34, fontWeight: FontWeight.w900, color: AppColors.chonta.withValues(alpha: 0.4))),
    );
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.pop(context, option),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          AspectRatio(
            aspectRatio: 4 / 3,
            child: Stack(fit: StackFit.expand, children: [
              ColoredBox(
                color: AppColors.cream,
                child: option.imageUrl == null ? placeholder : Image.network(option.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => placeholder),
              ),
              Positioned(
                left: 8,
                bottom: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: chipFill, borderRadius: BorderRadius.circular(9)),
                  child: Text(delta == 0 ? l10n.adjSamePrice : _signed(delta, language), style: TextStyle(color: chipInk, fontSize: 12, fontWeight: FontWeight.w900)),
                ),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(option.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, height: 1.2)),
              const SizedBox(height: 6),
              Text(formatPesos(option.priceCents, language), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// En el recibo: lo que cambió por las preguntas ya respondidas. El total de arriba ya lo incluye (la API lo
/// calcula con las líneas efectivas).
class AdjustmentChanges extends StatelessWidget {
  const AdjustmentChanges({super.key, required this.adjustments});

  final List<OrderAdjustment> adjustments;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final lines = AdjustmentRules.changes(adjustments);
    if (lines.isEmpty) return const SizedBox.shrink();
    final muted = AppColors.ink.withValues(alpha: 0.45);
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Icon(Icons.shopping_basket_rounded, size: 14, color: AppColors.chonta),
          const SizedBox(width: 6),
          Text(l10n.adjChangesTitle.toUpperCase(), style: const TextStyle(color: AppColors.chonta, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.6)),
        ]),
        const SizedBox(height: 6),
        for (final line in lines)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Text(
                  '${line.quantity}× ${line.name}',
                  style: line.decision == AdjustmentDecisions.acceptPrice
                      ? const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)
                      : TextStyle(fontSize: 13, color: muted, decoration: TextDecoration.lineThrough, decorationColor: AppColors.chonta.withValues(alpha: 0.6)),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  switch (line.decision) {
                    AdjustmentDecisions.substitute when line.substitute != null => l10n.adjChangeSubstitute(line.substitute!.name),
                    AdjustmentDecisions.acceptPrice when line.reportedUnitCents != null => l10n.adjChangePrice(formatPesos(line.reportedUnitCents!, language)),
                    AdjustmentDecisions.expiredRemoved => l10n.adjChangeExpired,
                    _ => l10n.adjChangeRemoved,
                  },
                  textAlign: TextAlign.end,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.ink.withValues(alpha: 0.6)),
                ),
              ),
            ]),
          ),
      ]),
    );
  }
}
