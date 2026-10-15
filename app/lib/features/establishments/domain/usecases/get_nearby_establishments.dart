import '../entities/establishment.dart';
import '../repositories/establishment_repository.dart';

class GetNearbyEstablishments {
  const GetNearbyEstablishments(this._repository);

  final EstablishmentRepository _repository;

  Future<List<Establishment>> call(GeoPoint origin, List<EstablishmentCategory> categories) async {
    final result = await _repository.findNearby(origin: origin, categories: categories);
    return [...result]..sort((a, b) => a.distanceMeters.compareTo(b.distanceMeters));
  }
}
