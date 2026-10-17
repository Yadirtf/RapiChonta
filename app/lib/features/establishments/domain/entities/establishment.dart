import 'package:equatable/equatable.dart';

class GeoPoint extends Equatable {
  const GeoPoint(this.lat, this.lng);

  final double lat;
  final double lng;

  @override
  List<Object?> get props => [lat, lng];
}

/// Categoría del catálogo `establishment_categories`: la crea el administrador, no está fija en la app.
class Category extends Equatable {
  const Category({required this.code, required this.icon, required this.names});

  final String code;

  /// Nombre de un ícono de la lista cerrada de la API (estilo lucide); la presentación lo traduce.
  final String icon;

  /// Nombre por idioma ('es' siempre, 'en' opcional).
  final Map<String, String> names;

  String name(String language) => (language == 'en' ? names['en'] : null) ?? names['es'] ?? code;

  @override
  List<Object?> get props => [code, icon, names];
}

/// Establecimiento en el mapa (GET /establishments/nearby).
class Establishment extends Equatable {
  const Establishment({
    required this.id,
    required this.name,
    required this.category,
    required this.address,
    required this.location,
    required this.distanceMeters,
    this.categoryIcon = 'store',
    this.acceptsOrders = false,
    this.logoUrl,
  });

  final String id;
  final String name;

  /// Código de la categoría principal.
  final String category;
  final String categoryIcon;
  final String address;
  final GeoPoint location;
  final int distanceMeters;

  /// Solo los establecimientos registrados y activos reciben pedidos (MVP).
  final bool acceptsOrders;
  final String? logoUrl;

  @override
  List<Object?> get props => [id];
}

class MenuProduct extends Equatable {
  const MenuProduct({
    required this.id,
    required this.versionId,
    required this.name,
    required this.priceCents,
    required this.prepMinutes,
    required this.orderable,
    this.description,
    this.imageUrl,
  });

  final String id;

  /// Versión vigente: el pedido citará esta versión (precio y textos inmutables).
  final String versionId;
  final String name;
  final String? description;

  /// Pesos en centavos enteros: los precios nunca se suman como `double`.
  final int priceCents;
  final int prepMinutes;
  final bool orderable;
  final String? imageUrl;

  @override
  List<Object?> get props => [id, versionId, priceCents, orderable];
}

class MenuSection extends Equatable {
  const MenuSection({required this.id, required this.name, required this.products});

  final String id;
  final String name;
  final List<MenuProduct> products;

  @override
  List<Object?> get props => [id, name, products];
}

class EstablishmentCategoryTag extends Equatable {
  const EstablishmentCategoryTag({required this.code, required this.icon, required this.primary});

  final String code;
  final String icon;
  final bool primary;

  @override
  List<Object?> get props => [code, icon, primary];
}

/// Página del local con su menú en el idioma pedido (GET /establishments/:id).
class EstablishmentDetail extends Equatable {
  const EstablishmentDetail({
    required this.id,
    required this.name,
    required this.address,
    required this.acceptsOrders,
    required this.location,
    required this.categories,
    required this.sections,
    this.logoUrl,
  });

  final String id;
  final String name;
  final String address;
  final bool acceptsOrders;
  final GeoPoint location;
  final String? logoUrl;
  final List<EstablishmentCategoryTag> categories;
  final List<MenuSection> sections;

  EstablishmentCategoryTag? get primaryCategory =>
      categories.where((c) => c.primary).firstOrNull ?? categories.firstOrNull;

  Iterable<MenuProduct> get products => sections.expand((s) => s.products);

  @override
  List<Object?> get props => [id, name, acceptsOrders, sections];
}

/// "12000.50" → 1200050. La API manda precios como texto decimal; null si el formato no es válido.
int? parsePriceCents(String decimal) {
  final match = RegExp(r'^(\d{1,10})(?:\.(\d{1,2}))?$').firstMatch(decimal.trim());
  if (match == null) return null;
  return int.parse(match.group(1)!) * 100 + int.parse((match.group(2) ?? '').padRight(2, '0'));
}
