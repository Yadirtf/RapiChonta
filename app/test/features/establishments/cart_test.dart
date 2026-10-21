import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/establishments/domain/entities/cart.dart';
import 'package:rapichonta/features/establishments/domain/entities/establishment.dart';

MenuProduct _product(String id, int cents, {bool orderable = true, String version = 'v1'}) =>
    MenuProduct(id: id, versionId: version, name: 'P$id', priceCents: cents, prepMinutes: 0, orderable: orderable);

EstablishmentDetail _menu(String id, List<MenuProduct> products, {bool open = true}) => EstablishmentDetail(
      id: id,
      name: 'Local $id',
      address: '',
      acceptsOrders: open,
      location: const GeoPoint(0, 0),
      categories: const [],
      sections: [MenuSection(id: 's', name: 'S', products: products)],
    );

void main() {
  group('CartRules', () {
    test('agregar dos veces suma la cantidad y el subtotal va en centavos', () {
      var cart = CartRules.add(null, establishmentId: 'e1', establishmentName: 'Uno', product: _product('a', 850000));
      cart = CartRules.add(cart, establishmentId: 'e1', establishmentName: 'Uno', product: _product('a', 850000));
      cart = CartRules.add(cart, establishmentId: 'e1', establishmentName: 'Uno', product: _product('b', 150));
      expect(cart.quantityOf('a'), 2);
      expect(cart.count, 3);
      expect(cart.subtotalCents, 1700150);
    });

    test('un producto de otro local empieza una canasta nueva', () {
      final cart = CartRules.add(null, establishmentId: 'e1', establishmentName: 'Uno', product: _product('a', 100));
      expect(cart.belongsToOther('e2'), isTrue);
      final next = CartRules.add(cart, establishmentId: 'e2', establishmentName: 'Dos', product: _product('z', 100));
      expect(next.establishmentId, 'e2');
      expect(next.lines.map((l) => l.productId), ['z']);
    });

    test('la cantidad se limita a 20 y 0 quita la línea', () {
      final cart = CartRules.add(null, establishmentId: 'e1', establishmentName: 'Uno', product: _product('a', 100));
      expect(CartRules.setQuantity(cart, 'a', 99)!.quantityOf('a'), Cart.maxQuantity);
      expect(CartRules.setQuantity(cart, 'a', 0), isNull);
    });

    test('conciliar quita lo agotado y toma el precio y la versión vigentes', () {
      var cart = CartRules.add(null, establishmentId: 'e1', establishmentName: 'Uno', product: _product('a', 100));
      cart = CartRules.add(cart, establishmentId: 'e1', establishmentName: 'Uno', product: _product('b', 200));
      final result = CartRules.reconcile(cart, _menu('e1', [_product('a', 120, version: 'v2'), _product('b', 200, orderable: false)]));
      expect(result.removed, ['Pb']);
      expect(result.repriced, ['Pa']);
      expect(result.cart!.lines.single.priceCents, 120);
      expect(result.cart!.lines.single.versionId, 'v2');
    });

    test('si el local cerró, la canasta se vacía', () {
      final cart = CartRules.add(null, establishmentId: 'e1', establishmentName: 'Uno', product: _product('a', 100));
      expect(CartRules.reconcile(cart, _menu('e1', [_product('a', 100)], open: false)).cart, isNull);
    });
  });

  test('parsePriceCents lee el decimal de la API sin usar double', () {
    expect(parsePriceCents('8500'), 850000);
    expect(parsePriceCents('8500.5'), 850050);
    expect(parsePriceCents('0.05'), 5);
    expect(parsePriceCents('-1'), isNull);
    expect(parsePriceCents('1e3'), isNull);
  });

  group('Canasta guardada y correcciones (E04)', () {
    test('se guarda y se lee con sus notas; lo dañado se descarta', () {
      var cart = CartRules.add(null, establishmentId: 'e1', establishmentName: 'Uno', product: _product('a', 100));
      cart = CartRules.setNotes(cart, 'a', 'Sin cebolla');
      expect(Cart.fromJson(cart.toJson()), cart);
      expect(Cart.fromJson(cart.toJson())!.lines.single.notes, 'Sin cebolla');
      expect(Cart.fromJson({'establishmentId': 'e1', 'establishmentName': 'Uno', 'lines': [{'productId': 'a'}]}), isNull);
      expect(Cart.fromJson('basura'), isNull);
    });

    test('las notas vacías se quitan y viajan recortadas al pedido', () {
      var cart = CartRules.add(null, establishmentId: 'e1', establishmentName: 'Uno', product: _product('a', 100));
      cart = CartRules.setNotes(cart, 'a', '  bien asado ');
      expect(cart.checkoutItems.single, {'productVersionId': 'v1', 'quantity': 1, 'notes': 'bien asado'});
      expect(CartRules.setNotes(cart, 'a', '   ').lines.single.notes, isNull);
    });

    test('lo que la API rechaza se quita y lo que cambió toma la versión nueva', () {
      var cart = CartRules.add(null, establishmentId: 'e1', establishmentName: 'Uno', product: _product('a', 100));
      cart = CartRules.add(cart, establishmentId: 'e1', establishmentName: 'Uno', product: _product('b', 200));
      final result = CartRules.applyCorrections(cart, unavailable: ['a'], changed: {'b': (versionId: 'v2', priceCents: 250)});
      expect(result.removed, ['Pa']);
      expect(result.repriced, ['Pb']);
      expect(result.cart!.lines.single.versionId, 'v2');
      expect(result.cart!.subtotalCents, 250);
    });
  });
}
