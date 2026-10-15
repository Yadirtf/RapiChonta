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

  String get label => switch (this) {
        EstablishmentCategory.fastFood => 'Comida rápida',
        EstablishmentCategory.restaurant => 'Restaurantes',
        EstablishmentCategory.supermarket => 'Supermercados',
        EstablishmentCategory.store => 'Tiendas',
        EstablishmentCategory.pharmacy => 'Farmacias',
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
    this.isPartner = false,
    this.logoUrl,
  });

  final String id;
  final String name;
  final EstablishmentCategory category;
  final String address;
  final GeoPoint location;
  final int distanceMeters;
  final bool isPartner;
  final String? logoUrl;

  @override
  List<Object?> get props => [id];
}
