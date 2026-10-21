import 'package:flutter/material.dart';

import '../../../../app/brand_logo.dart';
import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../establishments/presentation/widgets/storefront.dart';
import '../../../orders/presentation/widgets/order_visuals.dart';

/// Antes del permiso del sistema, la tienda explica para qué avisa: la ruta del pedido con sus cuatro paradas
/// y la mascota en moto recorriéndola. Solo se muestra una vez y solo cuando el sistema aún no preguntó.
class PushPermissionSheet extends StatelessWidget {
  const PushPermissionSheet({super.key, this.courier = false});

  /// El domiciliario recibe las ofertas de pedidos; el cliente, cómo va el suyo.
  final bool courier;

  static Future<bool?> show(BuildContext context, {bool courier = false}) => showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        backgroundColor: AppColors.cream,
        clipBehavior: Clip.antiAlias,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        builder: (context) => PushPermissionSheet(courier: courier),
      );

  static const stops = ['ACCEPTED', 'AT_ESTABLISHMENT', 'ON_THE_WAY', 'ARRIVING'];

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Awning(height: 22, stripe: 16),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 18, 24, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _RideAlong(stops: stops),
                const SizedBox(height: 22),
                Text(
                  courier ? l10n.pushAskCourierTitle : l10n.pushAskTitle,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: -0.6, color: AppColors.ink),
                ),
                const SizedBox(height: 8),
                Text(
                  courier ? l10n.pushAskCourierBody : l10n.pushAskBody,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.ink.withValues(alpha: 0.68), height: 1.35),
                ),
                const SizedBox(height: 22),
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: AppColors.chonta, foregroundColor: Colors.white),
                  onPressed: () => Navigator.of(context).pop(true),
                  icon: const Icon(Icons.notifications_active_rounded),
                  label: Text(l10n.pushAskYes),
                ),
                const SizedBox(height: 4),
                TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.pushAskLater)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// La ruta del pedido: cuatro paradas con su ícono y nombre, unidas por una línea punteada, y la mascota
/// avanzando de parada en parada (se detiene si el sistema pide menos animaciones).
class _RideAlong extends StatefulWidget {
  const _RideAlong({required this.stops});

  final List<String> stops;

  @override
  State<_RideAlong> createState() => _RideAlongState();
}

class _RideAlongState extends State<_RideAlong> with SingleTickerProviderStateMixin {
  late final _ride = AnimationController(vsync: this, duration: const Duration(milliseconds: 4200));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _ride.value = 1;
    } else if (!_ride.isAnimating) {
      _ride.repeat();
    }
  }

  @override
  void dispose() {
    _ride.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final count = widget.stops.length;
    return LayoutBuilder(builder: (context, constraints) {
      final width = constraints.maxWidth;
      final step = width / count;
      double xOf(double index) => step * index + step / 2;
      return SizedBox(
        height: 112,
        child: AnimatedBuilder(
          animation: _ride,
          builder: (context, _) {
            // Avanza y se detiene un momento en cada parada.
            final t = _ride.value * (count - 1) * 1.25;
            final at = (t.floorToDouble() + Curves.easeInOutCubic.transform((t % 1 * 1.6).clamp(0, 1))).clamp(0.0, count - 1.0);
            return Stack(clipBehavior: Clip.none, children: [
              Positioned(
                left: xOf(0),
                right: width - xOf(count - 1.0),
                top: 58,
                child: CustomPaint(size: const Size.fromHeight(4), painter: _DashedLine(progress: at / (count - 1))),
              ),
              for (var i = 0; i < count; i++)
                Positioned(
                  left: xOf(i.toDouble()) - step / 2,
                  width: step,
                  top: 44,
                  child: Column(children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: at >= i - 0.05 ? AppColors.chonta : Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(color: at >= i - 0.05 ? AppColors.chonta : AppColors.ink.withValues(alpha: 0.15), width: 2),
                      ),
                      child: Icon(statusIcon(widget.stops[i]), size: 17, color: at >= i - 0.05 ? Colors.white : AppColors.ink.withValues(alpha: 0.45)),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      statusLabel(l10n, widget.stops[i]),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      style: TextStyle(fontSize: 11, height: 1.1, fontWeight: FontWeight.w700, color: AppColors.ink.withValues(alpha: 0.7)),
                    ),
                  ]),
                ),
              Positioned(
                left: xOf(at) - 22,
                top: 0,
                child: Container(
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3), boxShadow: [
                    BoxShadow(color: AppColors.ink.withValues(alpha: 0.18), blurRadius: 10, offset: const Offset(0, 4)),
                  ]),
                  child: const BrandLogo(size: 38, showName: false, onDark: false),
                ),
              ),
            ]);
          },
        ),
      );
    });
  }
}

class _DashedLine extends CustomPainter {
  const _DashedLine({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final done = Paint()
      ..color = AppColors.chonta
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    final pending = Paint()
      ..color = AppColors.ink.withValues(alpha: 0.18)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    final y = size.height / 2;
    final reached = size.width * progress;
    canvas.drawLine(Offset(0, y), Offset(reached, y), done);
    for (var x = reached + 6; x < size.width; x += 10) {
      canvas.drawLine(Offset(x, y), Offset((x + 4).clamp(0, size.width), y), pending);
    }
  }

  @override
  bool shouldRepaint(_DashedLine old) => old.progress != progress;
}
