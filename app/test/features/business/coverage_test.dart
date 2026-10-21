import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/business/domain/business.dart';
import 'package:rapichonta/features/establishments/domain/entities/establishment.dart';

void main() {
  test('la cobertura llega en [lng, lat] y se lee como puntos (lat, lng)', () {
    final area = CoverageArea.fromJson({
      'municipality': {'id': 1, 'name': 'Villagarzón', 'center': {'lat': 1.0294, 'lng': -76.6165}},
      'polygons': [
        [
          [[-76.62, 1.02], [-76.61, 1.02], [-76.61, 1.04], [-76.62, 1.02]],
        ],
      ],
    });
    expect(area.municipalityName, 'Villagarzón');
    expect(area.center, const GeoPoint(1.0294, -76.6165));
    expect(area.polygons.single.single.first, const GeoPoint(1.02, -76.62));
  });

  test('dentro trae la tarifa en centavos; fuera, a cuánto queda la cobertura más cercana', () {
    final inside = CoverageCheck.fromJson({'covered': true, 'municipality': {'id': 1, 'name': 'Villagarzón'}, 'zone': {'name': 'Centro', 'kind': 'URBAN'}, 'fee': '4500.00'});
    expect(inside, isA<CoverageInside>().having((c) => c.feeCents, 'feeCents', 450000));

    final outside = CoverageCheck.fromJson({'covered': false, 'nearest': {'municipalityName': 'Villagarzón', 'distanceMeters': 612.4}});
    expect(outside, isA<CoverageOutside>().having((c) => c.distanceMeters, 'distanceMeters', 612));

    final none = CoverageCheck.fromJson({'covered': false, 'nearest': null});
    expect(none, isA<CoverageOutside>().having((c) => c.municipalityName, 'municipalityName', isNull));
  });
}
