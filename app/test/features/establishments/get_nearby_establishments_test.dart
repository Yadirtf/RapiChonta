import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/establishments/domain/entities/establishment.dart';
import 'package:rapichonta/features/establishments/domain/repositories/establishment_repository.dart';
import 'package:rapichonta/features/establishments/domain/usecases/get_nearby_establishments.dart';

class _FakeRepository implements EstablishmentRepository {
  List<String>? lastCategories;

  @override
  Future<List<Establishment>> findNearby({required GeoPoint origin, List<String> categories = const [], int radiusMeters = 3000}) async {
    lastCategories = categories;
    return const [
      Establishment(id: 'b', name: 'Lejos', category: 'comidas-rapidas', address: '', location: GeoPoint(0, 0), distanceMeters: 900),
      Establishment(id: 'a', name: 'Cerca', category: 'comidas-rapidas', address: '', location: GeoPoint(0, 0), distanceMeters: 100),
    ];
  }

  @override
  Future<List<Category>> categories() async => const [];

  @override
  Future<EstablishmentDetail> findById(String id, {required String language}) => throw UnimplementedError();
}

void main() {
  test('ordena los establecimientos del más cercano al más lejano', () async {
    final repository = _FakeRepository();
    final result = await GetNearbyEstablishments(repository)(const GeoPoint(0, 0), {'comidas-rapidas'});
    expect(result.map((e) => e.id), ['a', 'b']);
    expect(repository.lastCategories, ['comidas-rapidas']);
  });
}
