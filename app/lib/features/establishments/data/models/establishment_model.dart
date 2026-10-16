import '../../domain/entities/establishment.dart';

/// DTO: traduce el JSON de la API a la entidad de dominio.
class EstablishmentModel {
  static Establishment fromJson(Map<String, dynamic> json) {
    final location = json['location'] as Map<String, dynamic>;
    return Establishment(
      id: json['id'] as String,
      name: json['name'] as String,
      category: EstablishmentCategoryX.fromApi(json['category'] as String),
      address: json['address'] as String,
      acceptsOrders: json['acceptsOrders'] as bool? ?? false,
      logoUrl: json['logoUrl'] as String?,
      location: GeoPoint((location['lat'] as num).toDouble(), (location['lng'] as num).toDouble()),
      distanceMeters: (json['distanceMeters'] as num).round(),
    );
  }
}
