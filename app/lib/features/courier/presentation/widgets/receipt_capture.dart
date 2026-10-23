import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/courier.dart';

/// Tipo real por los primeros bytes (la API hace lo mismo y rechaza lo que no sea JPEG, PNG o WebP).
String? sniffImageMime(Uint8List head) {
  if (head.length >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF) return 'image/jpeg';
  if (head.length >= 8 && head[0] == 0x89 && head[1] == 0x50 && head[2] == 0x4E && head[3] == 0x47) return 'image/png';
  if (head.length >= 12 && String.fromCharCodes(head.sublist(0, 4)) == 'RIFF' && String.fromCharCodes(head.sublist(8, 12)) == 'WEBP') return 'image/webp';
  return null;
}

/// Toma la foto con la cámara, reducida (1600 px, calidad 78): se lee bien y sube rápido con poca señal.
Future<ReceiptPhoto?> captureReceipt() => _pick(ImageSource.camera);

/// El QR de cobro lo da el banco como imagen: se elige de la galería, no se fotografía.
Future<ReceiptPhoto?> pickFromGallery() => _pick(ImageSource.gallery);

Future<ReceiptPhoto?> _pick(ImageSource source) async {
  final file = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 78);
  if (file == null) return null;
  final bytes = await file.readAsBytes();
  final mime = sniffImageMime(bytes);
  return mime == null ? null : ReceiptPhoto(bytes: bytes, mimeType: mime);
}

/// El recuadro de la factura: vacío es un recibo punteado con la cámara; con foto, la miniatura.
class ReceiptTile extends StatelessWidget {
  const ReceiptTile({super.key, required this.photo, required this.onCapture, this.missing = false});

  final ReceiptPhoto? photo;
  final VoidCallback onCapture;
  final bool missing;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final photo = this.photo;
    return Semantics(
      button: true,
      label: photo == null ? l10n.tripReceiptTake : l10n.tripReceiptRetake,
      child: Material(
        color: photo == null ? AppColors.cream : AppColors.ink,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onCapture,
          child: CustomPaint(
            painter: photo == null ? _DashedBorder(color: missing ? AppColors.chonta : AppColors.ink.withValues(alpha: 0.3)) : null,
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: 150, maxHeight: photo == null ? double.infinity : 170),
              child: photo == null
                  ? Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Container(
                        width: 54,
                        height: 54,
                        decoration: const BoxDecoration(color: AppColors.brand, shape: BoxShape.circle),
                        child: const Icon(Icons.receipt_long_rounded, color: AppColors.ink, size: 28),
                      ),
                      const SizedBox(height: 10),
                        Text(l10n.tripReceiptTake, textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900, color: missing ? AppColors.chontaStrong : AppColors.ink)),
                        Text(l10n.tripReceiptHint, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
                      ]),
                    )
                  : Stack(fit: StackFit.expand, children: [
                      Image.memory(Uint8List.fromList(photo.bytes), fit: BoxFit.cover, excludeFromSemantics: true),
                      Align(
                        alignment: Alignment.bottomRight,
                        child: Padding(
                          padding: const EdgeInsets.all(10),
                          child: Chip(
                            avatar: const Icon(Icons.photo_camera_rounded, size: 16),
                            label: Text(l10n.tripReceiptRetake),
                            backgroundColor: Colors.white,
                            side: BorderSide.none,
                            labelStyle: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                    ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _DashedBorder extends CustomPainter {
  _DashedBorder({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final path = Path()..addRRect(RRect.fromRectAndRadius((Offset.zero & size).deflate(1), const Radius.circular(20)));
    for (final metric in path.computeMetrics()) {
      for (var d = 0.0; d < metric.length; d += 14) {
        canvas.drawPath(metric.extractPath(d, d + 8), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorder old) => old.color != color;
}
