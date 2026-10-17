import 'package:equatable/equatable.dart';

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

  CartLine copyWith({int? quantity, String? versionId, String? name, int? priceCents, String? imageUrl}) => CartLine(
        productId: productId,
        versionId: versionId ?? this.versionId,
        name: name ?? this.name,
        priceCents: priceCents ?? this.priceCents,
        imageUrl: imageUrl ?? this.imageUrl,
        quantity: quantity ?? this.quantity,
      );

  @override
  List<Object?> get props => [productId, versionId, priceCents, quantity];
}

class Cart extends Equatable {
  const Cart({required this.establishmentId, required this.establishmentName, required this.lines});

  static const maxQuantity = 20;
  static const maxLines = 40;

  final String establishmentId;
  final String establishmentName;
  final List<CartLine> lines;

  int get count => lines.fold(0, (sum, l) => sum + l.quantity);
  int get subtotalCents => lines.fold(0, (sum, l) => sum + l.priceCents * l.quantity);

  int quantityOf(String productId) => lines.where((l) => l.productId == productId).firstOrNull?.quantity ?? 0;

  /// true si agregar de este establecimiento obliga a vaciar la canasta.
  bool belongsToOther(String establishmentId) => lines.isNotEmpty && this.establishmentId != establishmentId;

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
