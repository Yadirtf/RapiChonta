import 'package:flutter/material.dart';

/// El chontaduro con su cáliz y dos líneas de velocidad: el ícono pequeño de los avisos. Es el mismo trazo de
/// la silueta que Android muestra en la barra de estado (app/branding/android/res/drawable/ic_stat_rapichonta.xml,
/// generada por Docs/marca/generar_icono_aviso.py), así el aviso del sistema y el de la app se reconocen.
class ChontaGlyph extends StatelessWidget {
  const ChontaGlyph({super.key, this.size = 24, this.color = Colors.white});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => SizedBox.square(dimension: size, child: CustomPaint(painter: _ChontaPainter(color)));
}

class _ChontaPainter extends CustomPainter {
  const _ChontaPainter(this.color);

  final Color color;

  /// Trazo en una cuadrícula de 24 × 24 (la de los íconos de Android).
  static Path glyph() {
    final fruit = Path()
      ..fillType = PathFillType.evenOdd
      ..moveTo(12, 6.6)
      ..cubicTo(15.8, 6.6, 17.6, 10.2, 17.6, 13.9)
      ..cubicTo(17.6, 18.1, 15.2, 21.6, 12, 21.8)
      ..cubicTo(8.8, 21.6, 6.4, 18.1, 6.4, 13.9)
      ..cubicTo(6.4, 10.2, 8.2, 6.6, 12, 6.6)
      ..close()
      // Brillo: el fruto se ve redondo y no como una mancha.
      ..moveTo(9.3, 12.8)
      ..cubicTo(9.4, 11.2, 10.2, 9.9, 11.4, 9.3)
      ..cubicTo(10.8, 10.4, 10.4, 11.6, 10.3, 13)
      ..cubicTo(10.25, 13.6, 9.25, 13.5, 9.3, 12.8)
      ..close();
    final calyx = Path()
      ..moveTo(11.6, 7.6)
      ..cubicTo(10.9, 5.9, 9.4, 4.9, 7.6, 5)
      ..cubicTo(8.9, 5.7, 9.9, 6.7, 10.5, 7.9)
      ..close()
      ..moveTo(12.4, 7.6)
      ..cubicTo(13.1, 5.9, 14.6, 4.9, 16.4, 5)
      ..cubicTo(15.1, 5.7, 14.1, 6.7, 13.5, 7.9)
      ..close()
      ..moveTo(11.25, 7.4)
      ..lineTo(12, 2.8)
      ..lineTo(12.75, 7.4)
      ..close();
    final speed = Path()
      ..addRRect(RRect.fromLTRBR(1.2, 11.2, 5.4, 12.8, const Radius.circular(0.8)))
      ..addRRect(RRect.fromLTRBR(2.2, 15, 5.2, 16.6, const Radius.circular(0.8)));
    return Path()
      ..addPath(fruit, Offset.zero)
      ..addPath(calyx, Offset.zero)
      ..addPath(speed, Offset.zero);
  }

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24, size.height / 24);
    canvas.drawPath(glyph(), Paint()..color = color);
  }

  @override
  bool shouldRepaint(_ChontaPainter old) => old.color != color;
}
