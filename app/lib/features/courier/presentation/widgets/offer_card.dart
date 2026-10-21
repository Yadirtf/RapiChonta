import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../establishments/presentation/format/money.dart';
import '../../../establishments/presentation/widgets/storefront.dart';
import '../../../orders/presentation/widgets/order_visuals.dart';
import '../../domain/courier.dart';
import 'duty_widgets.dart';

/// H08.2: la oferta como comanda colgada del toldo. Arriba el local y el tiempo que queda; en medio lo que
/// hay que comprar; abajo cuánto se compra y cuánto gana. "Tomar pedido" es el botón grande.
class OfferCard extends StatefulWidget {
  const OfferCard({super.key, required this.offer, required this.onTake, required this.onSkip, required this.onExpired});

  final CourierOffer offer;
  final Future<void> Function() onTake;
  final Future<void> Function() onSkip;
  final VoidCallback onExpired;

  @override
  State<OfferCard> createState() => _OfferCardState();
}

class _OfferCardState extends State<OfferCard> {
  static const _visibleLines = 4;

  Timer? _tick;
  late Duration _total;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    // La ventana completa no viene en la oferta: se toma lo que quedaba al verla por primera vez.
    _total = _left();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
      if (_left() == Duration.zero) {
        _tick?.cancel();
        widget.onExpired();
      }
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Duration _left() {
    final left = widget.offer.expiresAt.difference(DateTime.now());
    return left.isNegative ? Duration.zero : left;
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final offer = widget.offer;
    final left = _left();
    final fraction = _total.inMilliseconds == 0 ? 0.0 : left.inMilliseconds / _total.inMilliseconds;
    final expired = left == Duration.zero;
    final muted = AppColors.ink.withValues(alpha: 0.6);
    final extra = offer.lines.length - _visibleLines;

    return Semantics(
      container: true,
      label: l10n.courierOfferTitle,
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        clipBehavior: Clip.antiAlias,
        elevation: 8,
        shadowColor: AppColors.ink.withValues(alpha: 0.22),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Awning(height: 16, stripe: 14, colorA: AppColors.chonta, colorB: AppColors.cream),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Eyebrow(l10n.courierOfferTitle),
                  const SizedBox(height: 4),
                  Text(offer.storeName, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                  const SizedBox(height: 2),
                  Text(offer.storeAddress, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: muted, fontSize: 13)),
                ]),
              ),
              const SizedBox(width: 12),
              Semantics(
                liveRegion: left.inSeconds <= 10,
                label: l10n.courierOfferSeconds(left.inSeconds),
                child: CountdownRing(
                  fraction: fraction,
                  urgent: left.inSeconds <= 10,
                  child: ExcludeSemantics(
                    child: Text('${left.inSeconds}', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: left.inSeconds <= 10 ? AppColors.chontaStrong : AppColors.ink)),
                  ),
                ),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
            child: Wrap(spacing: 8, runSpacing: 8, children: [
              if (offer.distanceMeters != null) _Chip(icon: Icons.near_me_rounded, text: l10n.courierOfferAway(formatDistance(offer.distanceMeters!, language))),
              if (offer.zoneName.isNotEmpty) _Chip(icon: Icons.map_rounded, text: offer.zoneName),
              _Chip(icon: paymentIcon(offer.paymentMethod), text: paymentLabel(l10n, offer.paymentMethod)),
            ]),
          ),
          Container(
            margin: const EdgeInsets.fromLTRB(14, 14, 14, 0),
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Eyebrow(l10n.courierOfferBuy(offer.itemCount), color: AppColors.ink.withValues(alpha: 0.5)),
              const SizedBox(height: 6),
              for (final line in offer.lines.take(_visibleLines))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    SizedBox(width: 30, child: Text('${line.quantity}×', style: const TextStyle(color: AppColors.chonta, fontWeight: FontWeight.w900))),
                    Expanded(child: Text(line.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))),
                  ]),
                ),
              if (extra > 0) Padding(padding: const EdgeInsets.only(left: 30, top: 2), child: Text(l10n.courierOfferMore(extra), style: TextStyle(color: muted, fontSize: 12))),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l10n.courierOfferItemsTotal, style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w600)),
                  Text(formatPesos(offer.itemsCents, language), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                ]),
              ),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(l10n.courierOfferFee, style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                PriceTag(label: formatPesos(offer.feeCents, language), fontSize: 20),
              ]),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Expanded(
                flex: 2,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(54)),
                  onPressed: _busy || expired ? null : () => _run(widget.onSkip),
                  child: Text(l10n.courierOfferSkip),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 3,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54), backgroundColor: AppColors.ink, foregroundColor: AppColors.brand),
                  onPressed: _busy || expired ? null : () => _run(widget.onTake),
                  icon: _busy
                      ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.brand))
                      : const Icon(Icons.two_wheeler_rounded),
                  label: Text(expired ? l10n.courierOfferGone : l10n.courierOfferTake),
                ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: AppColors.chontaSoft, borderRadius: BorderRadius.circular(99)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 14, color: AppColors.chontaStrong),
          const SizedBox(width: 5),
          Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.chontaStrong)),
        ]),
      );
}
