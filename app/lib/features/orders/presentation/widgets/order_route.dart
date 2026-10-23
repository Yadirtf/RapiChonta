import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/order.dart';
import 'order_visuals.dart';
import 'prep_clock.dart';

/// Línea de tiempo del pedido (RF-50) como la ruta de la moto: paradas cumplidas en chontaduro, la actual
/// latiendo en amarillo y las que faltan en punteado. Nunca muestra dónde está el domiciliario.
class OrderRoute extends StatelessWidget {
  const OrderRoute({super.key, required this.order});

  final OrderDetail order;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final stops = OrderRules.route(timeline: order.timeline, journey: order.journey, active: order.active);
    return Column(
      children: [
        for (var i = 0; i < stops.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 40,
                  child: Column(
                    children: [
                      _Stop(stop: stops[i]),
                      if (i < stops.length - 1)
                        Expanded(child: CustomPaint(painter: _RoadPainter(done: stops[i + 1].state != StopState.upcoming), size: const Size(3, double.infinity))),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(top: 8, bottom: i < stops.length - 1 ? 22 : 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          crossAxisAlignment: WrapCrossAlignment.end,
                          spacing: 8,
                          children: [
                            Text(
                              statusLabel(l10n, stops[i].status),
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                                color: stops[i].state == StopState.upcoming ? AppColors.ink.withValues(alpha: 0.4) : AppColors.ink,
                              ),
                            ),
                            if (stops[i].at != null)
                              Text(orderTime(stops[i].at!, language), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.ink.withValues(alpha: 0.45))),
                          ],
                        ),
                        if (stops[i].state == StopState.current && statusBody(l10n, stops[i].status) != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(statusBody(l10n, stops[i].status)!, style: TextStyle(fontSize: 13, color: AppColors.ink.withValues(alpha: 0.6))),
                          ),
                        // H09.1: mientras se prepara, la parada lleva su fogón con la cuenta regresiva.
                        if (stops[i].state == StopState.current && stops[i].status == 'PREPARING' && order.preparation != null) PrepStove(order: order),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Stop extends StatefulWidget {
  const _Stop({required this.stop});

  final RouteStop stop;

  @override
  State<_Stop> createState() => _StopState();
}

class _StopState extends State<_Stop> with SingleTickerProviderStateMixin {
  late final _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));

  void _sync() {
    final animate = widget.stop.state == StopState.current && !MediaQuery.disableAnimationsOf(context);
    if (!animate) {
      _pulse.reset();
    } else if (!_pulse.isAnimating) {
      _pulse.repeat();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(_Stop old) {
    super.didUpdateWidget(old);
    _sync();
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final stop = widget.stop;
    final attention = stop.state == StopState.current && statusTone(stop.status) == StatusTone.attention;
    final (fill, border, icon) = switch (stop.state) {
      StopState.upcoming => (Colors.white, AppColors.ink.withValues(alpha: 0.2), AppColors.ink.withValues(alpha: 0.3)),
      StopState.current => attention ? (AppColors.chonta, AppColors.chonta, Colors.white) : (AppColors.brand, AppColors.ink, AppColors.ink),
      StopState.done => (AppColors.chonta, AppColors.chonta, Colors.white),
    };
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) => Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: fill,
          shape: BoxShape.circle,
          border: Border.all(color: border, width: 3),
          boxShadow: stop.state == StopState.current
              ? [BoxShadow(color: AppColors.brand.withValues(alpha: 0.6 * (1 - _pulse.value)), spreadRadius: 12 * _pulse.value)]
              : null,
        ),
        child: child,
      ),
      child: Icon(statusIcon(stop.status), size: 18, color: icon),
    );
  }
}

/// El tramo entre paradas: carretera punteada si falta, línea llena de chontaduro si ya se recorrió.
class _RoadPainter extends CustomPainter {
  const _RoadPainter({required this.done});

  final bool done;

  @override
  void paint(Canvas canvas, Size size) {
    final x = size.width / 2;
    final paint = Paint()
      ..strokeWidth = 3
      ..color = done ? AppColors.chonta : AppColors.ink.withValues(alpha: 0.18);
    if (done) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
      return;
    }
    for (var y = 2.0; y < size.height; y += 10) {
      canvas.drawLine(Offset(x, y), Offset(x, (y + 5).clamp(0, size.height)), paint);
    }
  }

  @override
  bool shouldRepaint(_RoadPainter old) => old.done != done;
}

/// Tiquete del pedido: muescas a los lados, como el desprendible de una comanda.
class TicketClipper extends CustomClipper<Path> {
  const TicketClipper({this.notchAt = 0.6, this.radius = 24, this.notch = 11});

  /// Altura de las muescas (0 a 1).
  final double notchAt;
  final double radius;
  final double notch;

  @override
  Path getClip(Size size) {
    final card = Path()..addRRect(RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius)));
    final y = size.height * notchAt;
    final notches = Path()
      ..addOval(Rect.fromCircle(center: Offset(0, y), radius: notch))
      ..addOval(Rect.fromCircle(center: Offset(size.width, y), radius: notch));
    return Path.combine(PathOperation.difference, card, notches);
  }

  @override
  bool shouldReclip(TicketClipper old) => old.notchAt != notchAt || old.radius != radius;
}

/// Logo del local o el toldito por defecto.
class StoreLogo extends StatelessWidget {
  const StoreLogo({super.key, this.url, this.dark = false, this.size = 44});

  final String? url;
  final bool dark;
  final double size;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.32),
        child: Container(
          width: size,
          height: size,
          color: dark ? AppColors.brand : AppColors.cream,
          child: url == null
              ? Icon(Icons.storefront_rounded, color: dark ? AppColors.ink : AppColors.chonta, size: size * 0.48)
              : Image.network(url!, fit: BoxFit.cover, errorBuilder: (_, _, _) => Icon(Icons.storefront_rounded, color: dark ? AppColors.ink : AppColors.chonta)),
        ),
      );
}
