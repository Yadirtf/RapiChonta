import '../entities/establishment.dart';

/// Puerto del dominio. La capa data lo implementa; presentation solo conoce esta interfaz.
abstract interface class EstablishmentRepository {
  Future<List<Establishment>> findNearby({
    required GeoPoint origin,
    required List<EstablishmentCategory> categories,
    int radiusMeters = 3000,
  });
}
