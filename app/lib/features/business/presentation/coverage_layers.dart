import 'dart:math' as math;

import 'package:maplibre_gl/maplibre_gl.dart';

import '../../../app/theme.dart';
import '../../../core/map/brand_map.dart';
import '../../establishments/domain/entities/establishment.dart' show GeoPoint;
import '../domain/business.dart';

/// Marco amplio (5° alrededor de la cobertura) del que se recortan los huecos para oscurecer lo de afuera.
List<List<double>> _frame(List<List<List<double>>> borders) {
  final points = borders.expand((b) => b);
  final south = points.map((p) => p[1]).reduce(math.min) - 5;
  final north = points.map((p) => p[1]).reduce(math.max) + 5;
  final west = points.map((p) => p[0]).reduce(math.min) - 5;
  final east = points.map((p) => p[0]).reduce(math.max) + 5;
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

/// Anillo cerrado en GeoJSON ([lng, lat]).
List<List<double>> geoJsonRing(List<GeoPoint> ring) => [
      for (final p in ring) [p.lng, p.lat],
      if (ring.isNotEmpty && ring.first != ring.last) [ring.first.lng, ring.first.lat],
    ];

Map<String, dynamic> _coverageData(List<CoverageArea> areas) {
  final borders = [for (final area in areas) for (final polygon in area.polygons) geoJsonRing(polygon.first)];
  return {
    'type': 'FeatureCollection',
    'features': [
      if (borders.isNotEmpty) ...[
        {
          'type': 'Feature',
          'properties': {'kind': 'mask'},
          'geometry': {'type': 'Polygon', 'coordinates': [_frame(borders), ...borders]},
        },
        for (final border in borders)
          {
            'type': 'Feature',
            'properties': {'kind': 'border'},
            'geometry': {'type': 'LineString', 'coordinates': border},
          },
      ],
    ],
  };
}

/// Capas de la cobertura (H03.5), igual que en la web: lo que queda fuera se oscurece con tinta y el borde es
/// una línea punteada de chontaduro sobre un halo amarillo, como la raya de una carretera.
class CoverageLayers {
  CoverageLayers._();

  static const _source = 'rapichonta-coverage';

  static Future<void> add(MapLibreMapController map, List<CoverageArea> areas, {double dim = 0.28}) async {
    await map.addGeoJsonSource(_source, _coverageData(areas));
    await map.addFillLayer(
      _source,
      'rapichonta-coverage-mask',
      FillLayerProperties(fillColor: mapColor(AppColors.ink.withValues(alpha: dim))),
      filter: ['==', ['get', 'kind'], 'mask'],
      enableInteraction: false,
    );
    await map.addLineLayer(
      _source,
      'rapichonta-coverage-halo',
      LineLayerProperties(lineColor: mapColor(AppColors.brand.withValues(alpha: 0.55)), lineWidth: 7, lineJoin: 'round'),
      filter: ['==', ['get', 'kind'], 'border'],
      enableInteraction: false,
    );
    await map.addLineLayer(
      _source,
      'rapichonta-coverage-border',
      // Raya de 10 y espacio de 6 puntos, en unidades del grosor (2,5).
      LineLayerProperties(lineColor: mapColor(AppColors.chontaStrong), lineWidth: 2.5, lineDasharray: [4, 2.4]),
      filter: ['==', ['get', 'kind'], 'border'],
      enableInteraction: false,
    );
  }

  static Future<void> update(MapLibreMapController map, List<CoverageArea> areas) => map.setGeoJsonSource(_source, _coverageData(areas));
}
