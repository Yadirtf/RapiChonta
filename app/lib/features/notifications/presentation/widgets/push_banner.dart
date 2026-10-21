import 'package:flutter/material.dart';

import '../../../../app/brand_logo.dart';
import '../../../../app/theme.dart';
import '../../../orders/presentation/widgets/order_visuals.dart';
import '../../domain/push.dart';
import 'chonta_glyph.dart';

/// Aviso que llega con la app abierta: un tiquete oscuro que baja desde arriba con la mascota, el estado del
/// pedido y una mecha amarilla que se consume hasta que se va solo. Se toca para abrir el pedido o se desliza
/// hacia arriba para cerrarlo. Uno a la vez: el nuevo reemplaza al anterior.
class PushBanner extends StatefulWidget {
  const PushBanner({super.key, required this.notice, required this.onOpen, required this.onDone, this.duration = const Duration(seconds: 6)});

  final PushNotice notice;
  final VoidCallback onOpen;
  final VoidCallback onDone;
  final Duration duration;

  static OverlayEntry? _current;

  static void show(OverlayState overlay, PushNotice notice, {required VoidCallback onOpen}) {
    _current?.remove();
    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (context) => PushBanner(
        notice: notice,
        onOpen: onOpen,
        onDone: () {
          if (_current == entry) _current = null;
          if (entry.mounted) entry.remove();
        },
      ),
    );
    _current = entry;
    overlay.insert(entry);
  }

  @override
  State<PushBanner> createState() => _PushBannerState();
}

class _PushBannerState extends State<PushBanner> with TickerProviderStateMixin {
  late final _slide = AnimationController(vsync: this, duration: const Duration(milliseconds: 420), reverseDuration: const Duration(milliseconds: 220));
  late final _fuse = AnimationController(vsync: this, duration: widget.duration);

  @override
  void initState() {
    super.initState();
    _slide.forward();
    _fuse.forward().whenComplete(_close);
  }

  @override
  void dispose() {
    _slide.dispose();
    _fuse.dispose();
    super.dispose();
  }

  Future<void> _close() async {
    if (!mounted) return;
    await _slide.reverse();
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.notice.tap.status;
    final tone = status == null ? null : toneColors(statusTone(status));
    final code = widget.notice.tap.orderCode;
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        bottom: false,
        child: SlideTransition(
          position: Tween(begin: const Offset(0, -1.3), end: Offset.zero).animate(CurvedAnimation(parent: _slide, curve: Curves.easeOutBack, reverseCurve: Curves.easeIn)),
          child: Dismissible(
            key: ValueKey(widget.notice),
            direction: DismissDirection.up,
            onDismissed: (_) => widget.onDone(),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Semantics(
                liveRegion: true,
                button: true,
                child: Material(
                  color: AppColors.ink,
                  elevation: 12,
                  shadowColor: AppColors.ink.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(22),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () {
                      widget.onOpen();
                      _close();
                    },
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
                          child: Row(
                            children: [
                              // La mascota con el sello del estado en la esquina, como en la barra del teléfono.
                              SizedBox(
                                width: 48,
                                height: 48,
                                child: Stack(clipBehavior: Clip.none, children: [
                                  const BrandLogo(size: 44, showName: false),
                                  Positioned(
                                    right: -4,
                                    bottom: -4,
                                    child: Container(
                                      width: 24,
                                      height: 24,
                                      decoration: BoxDecoration(
                                        color: tone?.background ?? AppColors.chonta,
                                        shape: BoxShape.circle,
                                        border: Border.all(color: AppColors.ink, width: 2.5),
                                      ),
                                      child: Center(
                                        child: status == null
                                            ? const ChontaGlyph(size: 14)
                                            : Icon(statusIcon(status), size: 13, color: tone!.foreground),
                                      ),
                                    ),
                                  ),
                                ]),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(widget.notice.title,
                                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15)),
                                    const SizedBox(height: 2),
                                    Text(widget.notice.body, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white.withValues(alpha: 0.72), fontSize: 13)),
                                  ],
                                ),
                              ),
                              if (code != null) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                                  decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(8)),
                                  child: Text(code, style: const TextStyle(color: AppColors.brand, fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 1)),
                                ),
                              ],
                            ],
                          ),
                        ),
                        // La mecha: cuánto le queda al aviso en pantalla.
                        AnimatedBuilder(
                          animation: _fuse,
                          builder: (context, _) => Align(
                            alignment: Alignment.centerLeft,
                            child: FractionallySizedBox(
                              widthFactor: 1 - _fuse.value,
                              child: Container(height: 3, color: AppColors.brand),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
