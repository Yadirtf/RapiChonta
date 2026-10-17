import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

/// Lenguaje visual del catálogo, el mismo de la web: la tienda de barrio con su toldo a rayas,
/// la etiqueta de precio colgada, el aviso de puerta y el recibo de la canasta.

/// Toldo a rayas con borde festoneado; cada festón toma el color de su raya.
class Awning extends StatelessWidget {
  const Awning({super.key, this.height = 56, this.stripe = 28, this.colorA = AppColors.brand, this.colorB = AppColors.cream});

  final double height;
  final double stripe;
  final Color colorA;
  final Color colorB;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height + stripe / 2,
        width: double.infinity,
        child: CustomPaint(painter: _AwningPainter(height: height, stripe: stripe, a: colorA, b: colorB)),
      );
}

class _AwningPainter extends CustomPainter {
  _AwningPainter({required this.height, required this.stripe, required this.a, required this.b});

  final double height;
  final double stripe;
  final Color a;
  final Color b;

  @override
  void paint(Canvas canvas, Size size) {
    final shadow = Paint()
      ..color = AppColors.ink.withValues(alpha: 0.12)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2);
    final count = (size.width / stripe).ceil();
    for (var i = 0; i < count; i++) {
      final x = i * stripe;
      final paint = Paint()..color = i.isEven ? a : b;
      canvas.drawCircle(Offset(x + stripe / 2, height + 2), stripe / 2, shadow);
      canvas.drawRect(Rect.fromLTWH(x, 0, stripe + 0.5, height), paint);
      canvas.drawArc(Rect.fromCircle(center: Offset(x + stripe / 2, height), radius: stripe / 2), 0, math.pi, true, paint);
    }
  }

  @override
  bool shouldRepaint(_AwningPainter old) => old.a != a || old.b != b || old.height != height || old.stripe != stripe;
}

/// Etiqueta de precio con punta y ojal.
class PriceTag extends StatelessWidget {
  const PriceTag({super.key, required this.label, this.muted = false, this.fontSize = 15});

  final String label;
  final bool muted;
  final double fontSize;

  @override
  Widget build(BuildContext context) => ClipPath(
        clipper: _TagClipper(),
        child: Container(
          color: muted ? AppColors.ink.withValues(alpha: 0.12) : AppColors.brand,
          padding: const EdgeInsets.fromLTRB(20, 5, 12, 5),
          child: Text(label, style: TextStyle(fontWeight: FontWeight.w900, fontSize: fontSize, color: AppColors.ink, letterSpacing: -0.2)),
        ),
      );
}

class _TagClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final tag = Path()
      ..moveTo(10, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width, size.height)
      ..lineTo(10, size.height)
      ..lineTo(0, size.height / 2)
      ..close();
    final hole = Path()..addOval(Rect.fromCircle(center: Offset(10, size.height / 2), radius: 3));
    return Path.combine(PathOperation.difference, tag, hole);
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

/// Borde de recibo (dientes de sierra) arriba.
class ReceiptClipper extends CustomClipper<Path> {
  const ReceiptClipper({this.tooth = 10});

  final double tooth;

  @override
  Path getClip(Size size) {
    final path = Path()..moveTo(0, tooth);
    for (var x = 0.0; x < size.width; x += tooth * 2) {
      path
        ..lineTo(x + tooth, 0)
        ..lineTo(math.min(x + tooth * 2, size.width), tooth);
    }
    return path
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
  }

  @override
  bool shouldReclip(ReceiptClipper oldClipper) => oldClipper.tooth != tooth;
}

/// Aviso de puerta "Abierto / Cerrado", inclinado y colgado de un cordón.
class DoorSign extends StatelessWidget {
  const DoorSign({super.key, required this.open, required this.title, required this.subtitle});

  final bool open;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CustomPaint(size: const Size(36, 14), painter: _CordPainter()),
          Transform.rotate(
            angle: -0.05,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: open ? AppColors.leaf : Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: open ? const Color(0xFF6EE7B7) : Colors.white30, width: 2),
              ),
              child: Column(
                children: [
                  Text(title.toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 1.2)),
                  Text(subtitle, style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
        ],
      );
}

class _CordPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white54
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;
    canvas.drawPath(Path()
      ..moveTo(2, size.height)
      ..lineTo(size.width / 2, 2)
      ..lineTo(size.width - 2, size.height), paint);
    canvas.drawCircle(Offset(size.width / 2, 2), 2, Paint()..color = Colors.white70);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
