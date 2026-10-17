import '../entities/establishment.dart';
import '../repositories/establishment_repository.dart';

class GetNearbyEstablishments {
  const GetNearbyEstablishments(this._repository);

  final EstablishmentRepository _repository;

  /// Sin categorías elegidas se muestran todas.
  Future<List<Establishment>> call(GeoPoint origin, Iterable<String> categories) async {
    final result = await _repository.findNearby(origin: origin, categories: categories.toList());
    return [...result]..sort((a, b) => a.distanceMeters.compareTo(b.distanceMeters));
  }
}
