import 'dart:math' as math;

import '../../establishments/domain/entities/establishment.dart';

const _earth = 6371000.0;
double _rad(double deg) => deg * math.pi / 180;

/// Metros entre dos puntos (Haversine).
double metersBetween(GeoPoint a, GeoPoint b) {
  final dLat = _rad(b.lat - a.lat);
  final dLng = _rad(b.lng - a.lng);
  final h = math.pow(math.sin(dLat / 2), 2) + math.cos(_rad(a.lat)) * math.cos(_rad(b.lat)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * _earth * math.asin(math.min(1, math.sqrt(h)));
}

/// Rumbo de [from] a [to] en grados (0 = norte, 90 = oriente), para girar el mapa en la vista de navegación.
double bearingBetween(GeoPoint from, GeoPoint to) {
  final y = math.sin(_rad(to.lng - from.lng)) * math.cos(_rad(to.lat));
  final x = math.cos(_rad(from.lat)) * math.sin(_rad(to.lat)) - math.sin(_rad(from.lat)) * math.cos(_rad(to.lat)) * math.cos(_rad(to.lng - from.lng));
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

/// Dónde va el domiciliario sobre la ruta: a cuántos metros está de la línea y cuánto le falta por ella.
/// En un pueblo las distancias son cortas: basta proyectar en un plano local (error de centímetros).
({double offRoute, double remaining}) progressOnRoute(GeoPoint at, List<GeoPoint> line) {
  if (line.isEmpty) return (offRoute: double.infinity, remaining: 0);
  if (line.length == 1) return (offRoute: metersBetween(at, line.first), remaining: 0);
  final metersPerLng = _earth * _rad(1) * math.cos(_rad(at.lat));
  final metersPerLat = _earth * _rad(1);
  math.Point<double> local(GeoPoint p) => math.Point((p.lng - at.lng) * metersPerLng, (p.lat - at.lat) * metersPerLat);

  // Lo que falta desde el final de cada tramo hasta el destino.
  final after = List<double>.filled(line.length, 0);
  for (var i = line.length - 2; i >= 0; i--) {
    after[i] = after[i + 1] + metersBetween(line[i], line[i + 1]);
  }
  var best = (offRoute: double.infinity, remaining: 0.0);
  for (var i = 0; i < line.length - 1; i++) {
    final a = local(line[i]);
    final b = local(line[i + 1]);
    final ab = b - a;
    final length2 = ab.x * ab.x + ab.y * ab.y;
    // El domiciliario está en el origen del plano local: se proyecta (0, 0) sobre el tramo.
    final t = length2 == 0 ? 0.0 : (-(a.x * ab.x + a.y * ab.y) / length2).clamp(0.0, 1.0);
    final closest = a + ab * t;
    final off = closest.magnitude;
    if (off < best.offRoute) best = (offRoute: off, remaining: after[i + 1] + (b - closest).magnitude);
  }
  return best;
}
