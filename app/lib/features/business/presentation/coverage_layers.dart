import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../app/theme.dart';
import '../../establishments/domain/entities/establishment.dart' show GeoPoint;
import '../domain/business.dart';

/// Marco amplio (5° alrededor de la cobertura) del que se recortan los huecos para oscurecer lo de afuera.
/// No es el mundo entero: un anillo de 360° de ancho choca con la repetición horizontal de flutter_map.
List<LatLng> _frame(List<List<LatLng>> borders) {
  final points = borders.expand((b) => b);
  final south = points.map((p) => p.latitude).reduce(math.min) - 5;
  final north = points.map((p) => p.latitude).reduce(math.max) + 5;
  final west = points.map((p) => p.longitude).reduce(math.min) - 5;
  final east = points.map((p) => p.longitude).reduce(math.max) + 5;
  return [LatLng(south, west), LatLng(north, west), LatLng(north, east), LatLng(south, east)];
}

List<LatLng> _ring(List<GeoPoint> ring) => [for (final p in ring) LatLng(p.lat, p.lng)];

/// Capas de la cobertura (H03.5), igual que en la web: lo que queda fuera se oscurece con tinta y el borde es
/// una línea punteada de chontaduro sobre un halo amarillo, como la raya de una carretera.
List<Widget> coverageLayers(List<CoverageArea> areas, {double dim = 0.28}) {
  final borders = [for (final area in areas) for (final polygon in area.polygons) _ring(polygon.first)];
  if (borders.isEmpty) return const [];
  return [
    PolygonLayer(polygons: [Polygon(points: _frame(borders), holePointsList: borders, color: AppColors.ink.withValues(alpha: dim))]),
    PolylineLayer(polylines: [
      for (final border in borders) Polyline(points: [...border, border.first], strokeWidth: 7, color: AppColors.brand.withValues(alpha: 0.55)),
      for (final border in borders)
        Polyline(points: [...border, border.first], strokeWidth: 2.5, color: AppColors.chontaStrong, pattern: StrokePattern.dashed(segments: const [10, 6])),
    ]),
  ];
}
