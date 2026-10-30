import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../establishments/presentation/format/money.dart';
import '../../../notifications/presentation/widgets/chonta_glyph.dart';
import '../courier_providers.dart';

/// El papel del sobre de caja, el mismo de /panel/cajas: la oficina y el domiciliario miran el mismo sobre.
abstract final class Kraft {
  static const top = Color(0xFFFBEFCF);
  static const bottom = Color(0xFFFFFAF0);
  static const flap = Color(0xFFF3DFAE);
  static const edge = Color(0xFFE6CC8F);
}

/// "+ $ 20.000" o "− $ 18.000": el signo mira desde lo que el domiciliario debe.
String signedPesos(int cents, String language) {
  if (cents == 0) return formatPesos(0, language);
  return '${cents > 0 ? '+' : '−'} ${formatPesos(cents.abs(), language)}';
}

/// Qué dice el sobre grande: entregas, te deben o estás en cero.
({String label, Color color}) dueLook(AppLocalizations l10n, int cents) => switch (cents.sign) {
      1 => (label: l10n.cashDueLabel, color: AppColors.ink),
      -1 => (label: l10n.cashOwedLabel, color: AppColors.leaf),
      _ => (label: l10n.cashEvenLabel, color: AppColors.ink),
    };

String fundingModeLabel(AppLocalizations l10n, String? mode) => switch (mode) {
      'CASH_BOX' => l10n.cashModeCashBox,
      'OWN_FUNDS' => l10n.cashModeOwnFunds,
      _ => l10n.cashModeNone,
    };

/// La solapa del sobre: dos triángulos que se juntan en el centro, donde va el sello al cerrar.
class EnvelopeFlapPainter extends CustomPainter {
  const EnvelopeFlapPainter({this.color = Kraft.flap});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final flap = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(flap, Paint()..color = color);
    canvas.drawPath(
      Path()
        ..moveTo(0, 0)
        ..lineTo(size.width / 2, size.height)
        ..lineTo(size.width, 0),
      Paint()
        ..color = Kraft.edge
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2,
    );
  }

  @override
  bool shouldRepaint(EnvelopeFlapPainter old) => old.color != color;
}

/// El sello de lacre amarillo con el chontaduro: la caja se cerró en el arqueo.
class WaxSeal extends StatelessWidget {
  const WaxSeal({super.key, this.size = 54, this.label});

  final double size;
  final String? label;

  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const RadialGradient(center: Alignment(-0.3, -0.3), colors: [Color(0xFFFFD866), AppColors.brand, Color(0xFFD9A21C)], stops: [0, 0.55, 1]),
            boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.25), blurRadius: 8, offset: const Offset(0, 3))],
          ),
          alignment: Alignment.center,
          child: ChontaGlyph(size: size * 0.55, color: AppColors.chontaStrong),
        ),
      );
}

/// En el inicio del turno: el sobre chiquito con lo que va a entregar hoy. Sin base (o con la caja ya cerrada)
/// se vuelve tinta y explica por qué no le llegan pedidos. Toca para ver la caja completa.
class CashBoxStrip extends ConsumerWidget {
  const CashBoxStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final day = ref.watch(courierCashDayProvider(null)).value;
    if (day == null) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final box = day.box;
    final blocked = day.awaitingBase || (box?.closed ?? false);
    final due = box?.balance.amountDueCents ?? 0;
    final headline = day.awaitingBase
        ? l10n.cashHomeAwaiting
        : box?.closed ?? false
            ? l10n.cashHomeClosed
            : due > 0
                ? l10n.cashHomeDue(formatPesos(due, language))
                : due < 0
                    ? l10n.cashHomeOwed(formatPesos(-due, language))
                    : l10n.cashHomeEven;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Material(
        color: blocked ? AppColors.ink : Kraft.top,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/turno/caja'),
          child: Container(
            decoration: blocked ? null : BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: Kraft.edge)),
            padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
            child: Row(children: [
              _MiniEnvelope(dark: blocked, sealed: box?.closed ?? false),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    l10n.cashHomeTitle.toUpperCase(),
                    style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900, letterSpacing: 1.6, color: blocked ? AppColors.brand : AppColors.chontaStrong),
                  ),
                  const SizedBox(height: 2),
                  Text(headline, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: blocked ? Colors.white : AppColors.ink)),
                  if (day.awaitingBase)
                    Text(l10n.cashAwaitingTitle, style: const TextStyle(fontSize: 12, color: Colors.white70))
                  else if (!blocked)
                    Text(fundingModeLabel(l10n, day.fundingMode), style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.6))),
                ]),
              ),
              Icon(Icons.chevron_right_rounded, color: blocked ? AppColors.brand : AppColors.chontaStrong),
            ]),
          ),
        ),
      ),
    );
  }
}

class _MiniEnvelope extends StatelessWidget {
  const _MiniEnvelope({required this.dark, required this.sealed});

  final bool dark;
  final bool sealed;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 46,
        height: 34,
        child: Stack(clipBehavior: Clip.none, children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: dark ? AppColors.brand : Colors.white,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: dark ? AppColors.brand : Kraft.edge),
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 18,
            child: CustomPaint(painter: EnvelopeFlapPainter(color: dark ? const Color(0xFFD9A21C) : Kraft.flap)),
          ),
          if (sealed) const Positioned(left: 14, top: 9, child: WaxSeal(size: 18)),
        ]),
      );
}
