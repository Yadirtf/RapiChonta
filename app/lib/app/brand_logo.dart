import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'theme.dart';

/// Marca de RapiChonta: un chontaduro (con su racimo) cuya silueta es un pin de mapa, sobre la placa
/// amarilla. Es el mismo dibujo de web/public/brand/logo-mark.svg (lienzo de 48 × 48).
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = 40, this.showName = true, this.onDark = true});

  final double size;
  final bool showName;

  /// Fondo oscuro (menú lateral) o claro: cambia el color del nombre.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final mark = CustomPaint(size: Size.square(size), painter: const _LogoMarkPainter());
    if (!showName) return Semantics(label: 'RapiChonta', child: mark);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        mark,
        const SizedBox(width: 10),
        Text.rich(
          TextSpan(children: [
            TextSpan(text: 'Rapi', style: TextStyle(color: onDark ? Colors.white : AppColors.ink)),
            TextSpan(text: 'Chonta', style: TextStyle(color: onDark ? AppColors.chonta : AppColors.chontaStrong)),
          ]),
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.4),
        ),
      ],
    );
  }
}

class _LogoMarkPainter extends CustomPainter {
  const _LogoMarkPainter();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 48);
    final outline = Paint()
      ..style = PaintingStyle.stroke
      ..color = AppColors.ink
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;

    // Placa amarilla.
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(0, 0, 48, 48), const Radius.circular(14)), Paint()..color = AppColors.brand);

    // Líneas de velocidad: "Rapi".
    outline.strokeWidth = 2.6;
    canvas.drawLine(const Offset(5.5, 21), const Offset(11, 21), outline);
    canvas.drawLine(const Offset(4, 26.5), const Offset(11, 26.5), outline);
    canvas.drawLine(const Offset(6.5, 32), const Offset(11, 32), outline);

    // Segundo fruto del racimo, detrás.
    _rotated(canvas, const Offset(36.4, 18.6), 24, () {
      final oval = Rect.fromCenter(center: Offset.zero, width: 12, height: 15.2);
      canvas.drawOval(oval, Paint()..color = const Color(0xFFC9461F));
      canvas.drawOval(oval, outline..strokeWidth = 2);
    });

    // Chontaduro principal: rojo arriba, naranja y amarillo hacia la punta del pin.
    final fruit = Path()
      ..moveTo(26, 43.5)
      ..cubicTo(19.8, 37.5, 15.8, 32.3, 15.8, 24.9)
      ..cubicTo(15.8, 17.9, 20.4, 12.5, 26, 12.5)
      ..cubicTo(31.6, 12.5, 36.2, 17.9, 36.2, 24.9)
      ..cubicTo(36.2, 32.3, 32.2, 37.5, 26, 43.5)
      ..close();
    canvas.drawPath(
      fruit,
      Paint()
        ..shader = const LinearGradient(
          colors: [AppColors.chontaStrong, AppColors.chonta, Color(0xFFF7A531)],
          stops: [0, 0.45, 1],
        ).createShader(Rect.fromPoints(const Offset(15.8, 12.5), const Offset(20.9, 43.5))),
    );
    canvas.drawPath(fruit, outline..strokeWidth = 2.2);

    // Brillo de la piel.
    _rotated(canvas, const Offset(21.8, 21), 18, () {
      canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: 4.2, height: 8.4), Paint()..color = AppColors.cream.withValues(alpha: 0.85));
    });

    // Cáliz (capuchón) de la palma.
    final calyx = Path()
      ..moveTo(26, 10.2)
      ..lineTo(27.7, 12.6)
      ..lineTo(30.6, 12.1)
      ..lineTo(29.5, 14.7)
      ..lineTo(22.5, 14.7)
      ..lineTo(21.4, 12.1)
      ..lineTo(24.3, 12.6)
      ..close();
    canvas.drawPath(calyx, Paint()..color = AppColors.leaf);
    canvas.drawPath(calyx, outline..strokeWidth = 1.5);
  }

  void _rotated(Canvas canvas, Offset center, double degrees, VoidCallback draw) {
    canvas
      ..save()
      ..translate(center.dx, center.dy)
      ..rotate(degrees * math.pi / 180);
    draw();
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
