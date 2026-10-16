import 'package:equatable/equatable.dart';

enum EstablishmentCategory { fastFood, restaurant, supermarket, store, pharmacy }

extension EstablishmentCategoryX on EstablishmentCategory {
  String get apiValue => switch (this) {
        EstablishmentCategory.fastFood => 'FAST_FOOD',
        EstablishmentCategory.restaurant => 'RESTAURANT',
        EstablishmentCategory.supermarket => 'SUPERMARKET',
        EstablishmentCategory.store => 'STORE',
        EstablishmentCategory.pharmacy => 'PHARMACY',
      };

  static EstablishmentCategory fromApi(String value) =>
      EstablishmentCategory.values.firstWhere((c) => c.apiValue == value, orElse: () => EstablishmentCategory.store);
}

class GeoPoint extends Equatable {
  const GeoPoint(this.lat, this.lng);

  final double lat;
  final double lng;

  @override
  List<Object?> get props => [lat, lng];
}

class Establishment extends Equatable {
  const Establishment({
    required this.id,
    required this.name,
    required this.category,
    required this.address,
    required this.location,
    required this.distanceMeters,
    this.acceptsOrders = false,
    this.logoUrl,
  });

  final String id;
  final String name;
  final EstablishmentCategory category;
  final String address;
  final GeoPoint location;
  final int distanceMeters;
  /// Solo los establecimientos registrados y activos reciben pedidos (MVP).
  final bool acceptsOrders;
  final String? logoUrl;

  @override
  List<Object?> get props => [id];
}
