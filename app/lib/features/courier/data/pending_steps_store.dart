import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../domain/courier.dart';
import '../domain/pending_steps.dart';

/// Dónde vive la cola sin señal (H08.8): debe sobrevivir a que el sistema cierre la app.
abstract interface class PendingStepsStore {
  Future<List<PendingStep>> load();
  Future<void> save(List<PendingStep> steps);

  /// Guarda la foto de la factura junto a la cola y devuelve su ruta.
  Future<String> keepReceipt(String stepId, ReceiptPhoto photo);
  Future<ReceiptPhoto?> readReceipt(PendingStep step);
  Future<void> dropReceipt(PendingStep step);
}

/// En el teléfono: un JSON y las fotos en el directorio de soporte de la app (no lo borra el sistema
/// como la caché y no lo ve el usuario en su galería). La factura es privada: no va a la galería.
class FilePendingStepsStore implements PendingStepsStore {
  Future<Directory> _dir() async {
    final dir = Directory('${(await getApplicationSupportDirectory()).path}/courier_queue');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  Future<File> _queue() async => File('${(await _dir()).path}/steps.json');

  @override
  Future<List<PendingStep>> load() async {
    final file = await _queue();
    if (!await file.exists()) return const [];
    try {
      final raw = jsonDecode(await file.readAsString());
      return [for (final entry in raw is List ? raw : const []) ?PendingStep.tryParse(entry)];
    } on FormatException {
      return const [];
    }
  }

  @override
  Future<void> save(List<PendingStep> steps) async {
    final file = await _queue();
    // Escribe aparte y renombra: un cierre a mitad de escritura no deja la cola dañada.
    final temp = File('${file.path}.tmp');
    await temp.writeAsString(jsonEncode([for (final s in steps) s.toJson()]), flush: true);
    await temp.rename(file.path);
  }

  @override
  Future<String> keepReceipt(String stepId, ReceiptPhoto photo) async {
    final file = File('${(await _dir()).path}/$stepId.${_extension(photo.mimeType)}');
    await file.writeAsBytes(photo.bytes, flush: true);
    return file.path;
  }

  @override
  Future<ReceiptPhoto?> readReceipt(PendingStep step) async {
    final path = step.receiptPath;
    if (path == null) return null;
    final file = File(path);
    if (!await file.exists()) return null;
    return ReceiptPhoto(bytes: await file.readAsBytes(), mimeType: step.receiptMime ?? 'image/jpeg');
  }

  @override
  Future<void> dropReceipt(PendingStep step) async {
    final path = step.receiptPath;
    if (path == null) return;
    final file = File(path);
    if (await file.exists()) await file.delete();
  }

  static String _extension(String mime) => switch (mime) {
        'image/png' => 'png',
        'image/webp' => 'webp',
        _ => 'jpg',
      };
}

/// En la web (vista previa) no hay disco: la cola vive mientras la pestaña esté abierta.
class MemoryPendingStepsStore implements PendingStepsStore {
  final _photos = <String, ReceiptPhoto>{};
  List<PendingStep> _steps = const [];

  @override
  Future<List<PendingStep>> load() async => _steps;

  @override
  Future<void> save(List<PendingStep> steps) async => _steps = List.unmodifiable(steps);

  @override
  Future<String> keepReceipt(String stepId, ReceiptPhoto photo) async {
    _photos[stepId] = photo;
    return 'memory:$stepId';
  }

  @override
  Future<ReceiptPhoto?> readReceipt(PendingStep step) async => _photos[step.id];

  @override
  Future<void> dropReceipt(PendingStep step) async => _photos.remove(step.id);
}

PendingStepsStore platformPendingStepsStore() => kIsWeb ? MemoryPendingStepsStore() : FilePendingStepsStore();
