import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

/// Lenguaje visual del turno: el mismo de la tienda de barrio (toldo, comanda, sellos de chontaduro), visto
/// desde la moto. Disponible es el toldo abierto en hoja; descansando, la persiana a media luz.

/// Palanca grande de Disponible: una pista con el toldo a rayas cuando está en turno y la chonta en moto
/// como perilla. Se puede tocar o deslizar.
class DutySwitch extends StatelessWidget {
  const DutySwitch({super.key, required this.on, required this.onChanged, required this.label, this.busy = false});

  final bool on;
  final bool busy;
  final String label;
  final ValueChanged<bool>? onChanged;

  static const _width = 132.0;
  static const _height = 64.0;

  @override
  Widget build(BuildContext context) {
    final enabled = onChanged != null && !busy;
    return Semantics(
      toggled: on,
      enabled: enabled,
      label: label,
      button: true,
      child: GestureDetector(
        onTap: enabled ? () => onChanged!(!on) : null,
        onHorizontalDragEnd: enabled
            ? (details) {
                final v = details.primaryVelocity ?? 0;
                if (v > 120 && !on) onChanged!(true);
                if (v < -120 && on) onChanged!(false);
              }
            : null,
        child: AnimatedOpacity(
          opacity: onChanged == null ? 0.45 : 1,
          duration: const Duration(milliseconds: 200),
          child: SizedBox(
            width: _width,
            height: _height,
            child: Stack(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(_height / 2),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 260),
                  color: on ? AppColors.leaf : AppColors.ink.withValues(alpha: 0.12),
                  child: AnimatedOpacity(
                    opacity: on ? 1 : 0,
                    duration: const Duration(milliseconds: 260),
                    child: const CustomPaint(size: Size(_width, _height), painter: _StripesPainter()),
                  ),
                ),
              ),
              AnimatedAlign(
                duration: const Duration(milliseconds: 320),
                curve: Curves.easeOutBack,
                alignment: on ? Alignment.centerRight : Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.all(5),
                  child: Container(
                    width: _height - 10,
                    height: _height - 10,
                    decoration: BoxDecoration(
                      color: on ? AppColors.brand : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: on ? AppColors.chonta : AppColors.ink.withValues(alpha: 0.12), width: 3),
                      boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.25), blurRadius: 10, offset: const Offset(0, 4))],
                    ),
                    child: busy
                        ? const Padding(padding: EdgeInsets.all(14), child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.ink))
                        : Icon(on ? Icons.two_wheeler_rounded : Icons.bedtime_rounded, color: on ? AppColors.ink : AppColors.ink.withValues(alpha: 0.45), size: 28),
                  ),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Rayas diagonales del toldo, en hoja sobre hoja (el turno abierto).
class _StripesPainter extends CustomPainter {
  const _StripesPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.14)
      ..strokeWidth = 9;
    for (var x = -size.height; x < size.width + size.height; x += 22) {
      canvas.drawLine(Offset(x, size.height), Offset(x + size.height, 0), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Anillo que se vacía con el tiempo que queda (oferta, preparación). Pasa a chontaduro en el último tramo.
class CountdownRing extends StatelessWidget {
  const CountdownRing({super.key, required this.fraction, required this.child, this.size = 56, this.stroke = 6, this.urgent = false, this.track});

  /// 1 = todo el tiempo, 0 = vencido.
  final double fraction;
  final Widget child;
  final double size;
  final double stroke;
  final bool urgent;
  final Color? track;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: CustomPaint(
          painter: _RingPainter(
            fraction: fraction.clamp(0, 1),
            stroke: stroke,
            color: urgent ? AppColors.chonta : AppColors.leaf,
            track: track ?? AppColors.ink.withValues(alpha: 0.08),
          ),
          child: Center(child: child),
        ),
      );
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.fraction, required this.stroke, required this.color, required this.track});

  final double fraction;
  final double stroke;
  final Color color;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final ring = rect.deflate(stroke / 2);
    canvas.drawArc(ring, 0, math.pi * 2, false, Paint()
      ..color = track
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke);
    canvas.drawArc(ring, -math.pi / 2, math.pi * 2 * fraction, false, Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = stroke);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.fraction != fraction || old.color != color;
}

/// "Buscando pedidos": ondas de chontaduro que salen de la moto, como el radar del barrio.
class SearchPulse extends StatefulWidget {
  const SearchPulse({super.key, this.size = 150});

  final double size;

  @override
  State<SearchPulse> createState() => _SearchPulseState();
}

class _SearchPulseState extends State<SearchPulse> with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400))..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.disableAnimationsOf(context);
    return SizedBox.square(
      dimension: widget.size,
      child: Stack(alignment: Alignment.center, children: [
        if (!reduce)
          AnimatedBuilder(
            animation: _controller,
            builder: (context, _) => CustomPaint(size: Size.square(widget.size), painter: _PulsePainter(_controller.value)),
          ),
        Container(
          width: widget.size * 0.42,
          height: widget.size * 0.42,
          decoration: BoxDecoration(
            color: AppColors.brand,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 4),
            boxShadow: [BoxShadow(color: AppColors.chonta.withValues(alpha: 0.35), blurRadius: 18, offset: const Offset(0, 8))],
          ),
          child: Icon(Icons.two_wheeler_rounded, size: widget.size * 0.22, color: AppColors.ink),
        ),
      ]),
    );
  }
}

class _PulsePainter extends CustomPainter {
  _PulsePainter(this.t);

  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    for (var i = 0; i < 3; i++) {
      final p = (t + i / 3) % 1;
      canvas.drawCircle(center, size.width * (0.2 + 0.3 * p), Paint()
        ..color = AppColors.chonta.withValues(alpha: 0.35 * (1 - p))
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3);
    }
  }

  @override
  bool shouldRepaint(_PulsePainter old) => old.t != t;
}

/// Tarjeta blanca del turno (mismo radio y sombra que las del pedido del cliente).
class DutyCard extends StatelessWidget {
  const DutyCard({super.key, required this.child, this.padding = const EdgeInsets.all(18), this.color = Colors.white});

  final Widget child;
  final EdgeInsets padding;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: padding,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(26),
          boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.08), blurRadius: 24, offset: const Offset(0, 10))],
        ),
        child: child,
      );
}

/// Rótulo pequeño en mayúsculas con espaciado (como "COMANDA" en el recibo).
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color = AppColors.chonta});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) =>
      Text(text.toUpperCase(), style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 2));
}

/// Cinta de "sin señal": los pasos guardados en el teléfono que aún no llegan.
class PendingRibbon extends StatelessWidget {
  const PendingRibbon({super.key, required this.title, required this.body, required this.sending, this.onRetry});

  final String title;
  final String body;
  final bool sending;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
          decoration: BoxDecoration(
            color: AppColors.cream,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.brand, width: 2),
          ),
          child: Row(children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(12)),
              child: sending
                  ? const Padding(padding: EdgeInsets.all(9), child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.ink))
                  : const Icon(Icons.cloud_upload_rounded, color: AppColors.ink, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
                Text(body, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.65))),
              ]),
            ),
            if (onRetry != null && !sending) IconButton(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), color: AppColors.chontaStrong),
          ]),
        ),
      );
}
