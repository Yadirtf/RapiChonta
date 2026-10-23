import 'package:flutter/foundation.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../config/env.dart';

/// Villagarzón queda guardado en el teléfono la primera vez que se abre un mapa: calles, nombres e íconos del
/// casco urbano y alrededores (unos pocos MB, una sola descarga). Después el mapa abre al instante y se ve sin
/// señal. Lo demás que se mira queda en la caché de MapLibre (hasta 50 MB, la borra el propio motor).
class OfflineArea {
  OfflineArea._();

  static const _name = 'villagarzon';

  /// ~13 km alrededor del centro de Villagarzón (1.0294, -76.6165).
  static final _bounds = LatLngBounds(southwest: const LatLng(0.97, -76.68), northeast: const LatLng(1.09, -76.55));

  /// Las teselas de OpenFreeMap cambian de versión cuando actualizan el mapa: cada mes se baja de nuevo.
  static const _maxAge = Duration(days: 30);

  static bool _started = false;

  /// Una vez por sesión y en segundo plano: si falla (sin señal), se intenta la próxima vez que abra la app.
  static Future<void> ensure() async {
    if (_started || kIsWeb) return;
    _started = true;
    try {
      for (final region in await getListOfRegions()) {
        if (region.metadata['name'] != _name) continue;
        final savedAt = DateTime.tryParse('${region.metadata['savedAt']}');
        final fresh = savedAt != null && DateTime.now().difference(savedAt) < _maxAge;
        if (fresh && (await getOfflineRegionStatus(region.id)).isComplete) return;
        await deleteOfflineRegion(region.id);
      }
      await downloadOfflineRegion(
        // El estilo original: sus teselas, letras e íconos son los mismos que usa el estilo repintado.
        OfflineRegionDefinition(bounds: _bounds, mapStyleUrl: Env.mapStyleUrl, minZoom: 10, maxZoom: 14),
        metadata: {'name': _name, 'savedAt': DateTime.now().toIso8601String()},
      );
    } catch (_) {
      // Sin red o sin espacio: el mapa sigue funcionando en línea.
    }
  }
}
