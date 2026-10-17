import '../entities/establishment.dart';

/// Puerto del dominio. La capa data lo implementa; presentation solo conoce esta interfaz.
abstract interface class EstablishmentRepository {
  /// Sin categorías = todas.
  Future<List<Establishment>> findNearby({required GeoPoint origin, List<String> categories = const [], int radiusMeters = 3000});

  Future<List<Category>> categories();

  /// Menú con los textos en [language] (o en español si falta la traducción).
  Future<EstablishmentDetail> findById(String id, {required String language});
}
