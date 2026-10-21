import 'package:equatable/equatable.dart';
import 'package:flutter/widgets.dart' show StringCharacters;

import 'establishment.dart';

/// Canasta del cliente: de un solo establecimiento, porque un domiciliario compra en un solo lugar.
/// Guarda una copia del precio para mostrarla; el pedido (E04) se confirma con la versión vigente.
class CartLine extends Equatable {
  const CartLine({
    required this.productId,
    required this.versionId,
    required this.name,
    required this.priceCents,
    required this.quantity,
    this.imageUrl,
    this.notes,
  });

  factory CartLine.of(MenuProduct product) => CartLine(
        productId: product.id,
        versionId: product.versionId,
        name: product.name,
        priceCents: product.priceCents,
        imageUrl: product.imageUrl,
        quantity: 1,
      );

  final String productId;
  final String versionId;
  final String name;
  final int priceCents;
  final String? imageUrl;
  final int quantity;

  /// Indicación para el domiciliario ("sin cebolla"); viaja con el pedido.
  final String? notes;

  CartLine copyWith({int? quantity, String? versionId, String? name, int? priceCents, String? imageUrl, String? Function()? notes}) => CartLine(
        productId: productId,
        versionId: versionId ?? this.versionId,
        name: name ?? this.name,
        priceCents: priceCents ?? this.priceCents,
        imageUrl: imageUrl ?? this.imageUrl,
        quantity: quantity ?? this.quantity,
        notes: notes != null ? notes() : this.notes,
      );

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'versionId': versionId,
        'name': name,
        'priceCents': priceCents,
        'imageUrl': imageUrl,
        'quantity': quantity,
        'notes': notes,
      };

  @override
  List<Object?> get props => [productId, versionId, priceCents, quantity, notes];
}

class Cart extends Equatable {
  const Cart({required this.establishmentId, required this.establishmentName, required this.lines});

  static const maxQuantity = 20;
  static const maxLines = 40;
  static const maxNotes = 200;

  final String establishmentId;
  final String establishmentName;
  final List<CartLine> lines;

  int get count => lines.fold(0, (sum, l) => sum + l.quantity);
  int get subtotalCents => lines.fold(0, (sum, l) => sum + l.priceCents * l.quantity);

  int quantityOf(String productId) => lines.where((l) => l.productId == productId).firstOrNull?.quantity ?? 0;

  /// true si agregar de este establecimiento obliga a vaciar la canasta.
  bool belongsToOther(String establishmentId) => lines.isNotEmpty && this.establishmentId != establishmentId;

  Map<String, dynamic> toJson() => {
        'establishmentId': establishmentId,
        'establishmentName': establishmentName,
        'lines': [for (final l in lines) l.toJson()],
      };

  /// Lectura defensiva de lo guardado en el teléfono (puede venir de una versión vieja de la app).
  static Cart? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['establishmentId'];
    final name = json['establishmentName'];
    final raw = json['lines'];
    if (id is! String || name is! String || raw is! List) return null;
    final lines = <CartLine>[
      for (final l in raw.whereType<Map>())
        if (l['productId'] is String && l['versionId'] is String && l['name'] is String && l['priceCents'] is int && l['quantity'] is int && (l['quantity'] as int) > 0)
          CartLine(
            productId: l['productId'] as String,
            versionId: l['versionId'] as String,
            name: l['name'] as String,
            priceCents: l['priceCents'] as int,
            imageUrl: l['imageUrl'] is String ? l['imageUrl'] as String : null,
            quantity: (l['quantity'] as int).clamp(1, maxQuantity),
            notes: l['notes'] is String ? (l['notes'] as String).characters.take(maxNotes).toString() : null,
          ),
    ].take(maxLines).toList();
    return lines.isEmpty ? null : Cart(establishmentId: id, establishmentName: name, lines: lines);
  }

  /// Lo que la API recibe al cotizar o confirmar: la versión que vio el cliente, la cantidad y su nota.
  List<Map<String, dynamic>> get checkoutItems => [
        for (final l in lines)
          {'productVersionId': l.versionId, 'quantity': l.quantity, 'notes': (l.notes?.trim().isEmpty ?? true) ? null : l.notes!.trim()},
      ];

  @override
  List<Object?> get props => [establishmentId, lines];
}

/// Reglas de la canasta como funciones puras: fáciles de probar y sin estado oculto.
abstract final class CartRules {
  static Cart add(Cart? cart, {required String establishmentId, required String establishmentName, required MenuProduct product}) {
    final base = cart != null && !cart.belongsToOther(establishmentId)
        ? cart
        : Cart(establishmentId: establishmentId, establishmentName: establishmentName, lines: const []);
    final existing = base.quantityOf(product.id);
    if (existing > 0) return setQuantity(base, product.id, existing + 1) ?? base;
    if (base.lines.length >= Cart.maxLines) return base;
    return Cart(establishmentId: establishmentId, establishmentName: establishmentName, lines: [...base.lines, CartLine.of(product)]);
  }

  /// Cantidad nueva; 0 quita la línea. Devuelve null si la canasta queda vacía.
  static Cart? setQuantity(Cart cart, String productId, int quantity) {
    final q = quantity.clamp(0, Cart.maxQuantity);
    final lines = [
      for (final l in cart.lines)
        if (l.productId != productId) l else if (q > 0) l.copyWith(quantity: q),
    ];
    return lines.isEmpty ? null : Cart(establishmentId: cart.establishmentId, establishmentName: cart.establishmentName, lines: lines);
  }

  /// Nota de una línea; vacía la quita.
  static Cart setNotes(Cart cart, String productId, String notes) {
    final text = notes.characters.take(Cart.maxNotes).toString();
    return Cart(
      establishmentId: cart.establishmentId,
      establishmentName: cart.establishmentName,
      lines: [for (final l in cart.lines) l.productId == productId ? l.copyWith(notes: () => text.trim().isEmpty ? null : text) : l],
    );
  }

  /// Aplica lo que respondió la API al confirmar: quita lo que ya no se puede pedir (PRODUCTS_UNAVAILABLE)
  /// y toma la versión y el precio nuevos (PRODUCTS_CHANGED) para que el cliente revise antes de volver a confirmar.
  static ({Cart? cart, List<String> removed, List<String> repriced}) applyCorrections(
    Cart cart, {
    Iterable<String> unavailable = const [],
    Map<String, ({String versionId, int priceCents})> changed = const {},
  }) {
    final gone = unavailable.toSet();
    final removed = <String>[];
    final repriced = <String>[];
    final lines = <CartLine>[];
    for (final line in cart.lines) {
      if (gone.contains(line.productId) || gone.contains(line.versionId)) {
        removed.add(line.name);
        continue;
      }
      final change = changed[line.productId];
      if (change == null) {
        lines.add(line);
        continue;
      }
      repriced.add(line.name);
      lines.add(line.copyWith(versionId: change.versionId, priceCents: change.priceCents));
    }
    return (
      cart: lines.isEmpty ? null : Cart(establishmentId: cart.establishmentId, establishmentName: cart.establishmentName, lines: lines),
      removed: removed,
      repriced: repriced,
    );
  }

  /// Pone la canasta al día con el menú recién cargado: quita lo que ya no se puede pedir y toma el
  /// precio y la versión vigentes. `removed` y `repriced` permiten avisar qué cambió.
  static ({Cart? cart, List<String> removed, List<String> repriced}) reconcile(Cart cart, EstablishmentDetail menu) {
    if (cart.establishmentId != menu.id) return (cart: cart, removed: const [], repriced: const []);
    final products = {for (final p in menu.products) p.id: p};
    final removed = <String>[];
    final repriced = <String>[];
    final lines = <CartLine>[];
    for (final line in cart.lines) {
      final current = products[line.productId];
      if (current == null || !current.orderable || !menu.acceptsOrders) {
        removed.add(line.name);
        continue;
      }
      if (current.priceCents != line.priceCents) repriced.add(current.name);
      lines.add(line.copyWith(versionId: current.versionId, name: current.name, priceCents: current.priceCents, imageUrl: current.imageUrl));
    }
    return (
      cart: lines.isEmpty ? null : Cart(establishmentId: cart.establishmentId, establishmentName: menu.name, lines: lines),
      removed: removed,
      repriced: repriced,
    );
  }
}
