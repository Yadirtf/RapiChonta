import '../../../../core/config/env.dart';
import '../../domain/entities/establishment.dart';

/// DTO: traduce el JSON de la API a las entidades de dominio.
class EstablishmentModel {
  static GeoPoint _point(Object? json) {
    final map = json as Map<String, dynamic>;
    return GeoPoint((map['lat'] as num).toDouble(), (map['lng'] as num).toDouble());
  }

  static Establishment fromJson(Map<String, dynamic> json) => Establishment(
        id: json['id'] as String,
        name: json['name'] as String,
        category: json['category'] as String? ?? '',
        categoryIcon: json['categoryIcon'] as String? ?? 'store',
        address: json['address'] as String? ?? '',
        acceptsOrders: json['acceptsOrders'] as bool? ?? false,
        logoUrl: Env.resolveAsset(json['logoUrl'] as String?),
        location: _point(json['location']),
        distanceMeters: (json['distanceMeters'] as num).round(),
      );

  static Category categoryFromJson(Map<String, dynamic> json) => Category(
        code: json['code'] as String,
        icon: json['icon'] as String? ?? 'store',
        names: Map<String, String>.from(json['names'] as Map),
      );

  static MenuProduct productFromJson(Map<String, dynamic> json) => MenuProduct(
        id: json['id'] as String,
        versionId: json['versionId'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        // Un precio con formato inesperado deja el producto sin poder pedirse, nunca con un valor inventado.
        priceCents: parsePriceCents(json['price'] as String? ?? '') ?? 0,
        prepMinutes: (json['prepMinutes'] as num?)?.toInt() ?? 0,
        orderable: (json['orderable'] as bool? ?? false) && parsePriceCents(json['price'] as String? ?? '') != null,
        imageUrl: Env.resolveAsset(json['imageUrl'] as String?),
      );

  static EstablishmentDetail detailFromJson(Map<String, dynamic> json) => EstablishmentDetail(
        id: json['id'] as String,
        name: json['name'] as String,
        address: json['address'] as String? ?? '',
        acceptsOrders: json['acceptsOrders'] as bool? ?? false,
        location: _point(json['location']),
        logoUrl: Env.resolveAsset(json['logoUrl'] as String?),
        categories: [
          for (final c in (json['categories'] as List? ?? const []).cast<Map<String, dynamic>>())
            EstablishmentCategoryTag(code: c['code'] as String, icon: c['icon'] as String? ?? 'store', primary: c['primary'] as bool? ?? false),
        ],
        sections: [
          for (final s in (json['sections'] as List? ?? const []).cast<Map<String, dynamic>>())
            MenuSection(
              id: s['id'] as String,
              name: s['name'] as String,
              products: (s['products'] as List? ?? const []).cast<Map<String, dynamic>>().map(productFromJson).toList(),
            ),
        ],
      );
}
