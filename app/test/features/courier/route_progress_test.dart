import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/courier/domain/courier.dart';
import 'package:rapichonta/features/courier/domain/route_progress.dart';
import 'package:rapichonta/features/establishments/domain/entities/establishment.dart';

void main() {
  // Una calle recta hacia el oriente y luego al norte (≈ 111 m por milésima de grado cerca del ecuador).
  const line = [GeoPoint(1.0, -76.620), GeoPoint(1.0, -76.618), GeoPoint(1.002, -76.618)];

  test('sobre la ruta: casi cero metros afuera y lo que falta por la línea', () {
    final p = progressOnRoute(const GeoPoint(1.0, -76.619), line);
    expect(p.offRoute, lessThan(1));
    expect(p.remaining, closeTo(111 + 222, 3));
  });

  test('una cuadra al lado de la ruta: se nota que se salió', () {
    final p = progressOnRoute(const GeoPoint(1.0006, -76.6195), line);
    expect(p.offRoute, closeTo(67, 2));
  });

  test('pasado el giro solo cuenta lo que queda del último tramo', () {
    expect(progressOnRoute(const GeoPoint(1.0015, -76.618), line).remaining, closeTo(55.5, 2));
  });

  test('rumbo: norte 0°, oriente 90°', () {
    expect(bearingBetween(line[0], line[1]), closeTo(90, 0.1));
    expect(bearingBetween(line[1], line[2]), closeTo(0, 0.1));
  });

  test('lee la ruta de la API ([lng, lat] → GeoPoint) y entiende cuándo no hay', () {
    final route = tripRouteFromJson({
      'target': 'CUSTOMER',
      'route': {
        'line': [
          [-76.62, 1.0],
          [-76.618, 1.002],
        ],
        'distanceMeters': 812.4,
        'durationSeconds': 133,
      },
    });
    expect(route, const TripRoute(towardsCustomer: true, line: [GeoPoint(1.0, -76.62), GeoPoint(1.002, -76.618)], distanceMeters: 812.4, durationSeconds: 133));
    expect(tripRouteFromJson(null), isNull);
    expect(tripRouteFromJson({'target': 'STORE', 'route': null}), isNull);
  });
}
