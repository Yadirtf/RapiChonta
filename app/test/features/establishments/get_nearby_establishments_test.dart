import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/establishments/domain/entities/establishment.dart';
import 'package:rapichonta/features/establishments/domain/repositories/establishment_repository.dart';
import 'package:rapichonta/features/establishments/domain/usecases/get_nearby_establishments.dart';

class _FakeRepository implements EstablishmentRepository {
  @override
  Future<List<Establishment>> findNearby({
    required GeoPoint origin,
    required List<EstablishmentCategory> categories,
    int radiusMeters = 3000,
  }) async =>
      const [
        Establishment(id: 'b', name: 'Lejos', category: EstablishmentCategory.fastFood, address: '', location: GeoPoint(0, 0), distanceMeters: 900),
        Establishment(id: 'a', name: 'Cerca', category: EstablishmentCategory.fastFood, address: '', location: GeoPoint(0, 0), distanceMeters: 100),
      ];
}

void main() {
  test('ordena los establecimientos del más cercano al más lejano', () async {
    final useCase = GetNearbyEstablishments(_FakeRepository());
    final result = await useCase(const GeoPoint(0, 0), [EstablishmentCategory.fastFood]);
    expect(result.map((e) => e.id), ['a', 'b']);
  });
}
