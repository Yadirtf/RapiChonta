import { version } from '../../../../test/orders/fakes';
import { Checkout, CartItem, MenuVersion } from './checkout';

const build = (items: CartItem[], menu: MenuVersion[], extra: Partial<Parameters<typeof Checkout.build>[0]> = {}) =>
  Checkout.build({
    establishmentId: 'local-1',
    items,
    menu,
    fee: '3000.00',
    exposure: { deliveredOrders: 0, activeItemsCents: 0 },
    newCustomerLimit: '100000.00',
    ...extra,
  });

describe('Checkout (H04.1, H04.3)', () => {
  it('suma productos y domicilio en centavos, y toma el tiempo del producto que más tarda', () => {
    const menu = [version('a', '12500.50'), version('b', '4000', { current: { versionId: 'b', name: 'Jugo', price: '4000.00', prepMinutes: 25 } })];
    const checkout = build(
      [
        { productVersionId: 'a', quantity: 2, notes: '  sin   cebolla ' },
        { productVersionId: 'b', quantity: 1 },
      ],
      menu,
    );
    expect(checkout.itemsCents).toBe(2_900_100);
    expect(checkout.feeCents).toBe(300_000);
    expect(checkout.totalCents).toBe(3_200_100);
    expect(checkout.prepMinutes).toBe(25);
    expect(checkout.lines[0].notes).toBe('sin cebolla');
  });

  it('rechaza productos agotados, de otro local o desconocidos, y los nombra para quitarlos de la canasta', () => {
    const menu = [version('a', '1000', { orderable: false }), version('b', '1000', { establishmentId: 'otro' })];
    expect(() => build([{ productVersionId: 'a', quantity: 1 }, { productVersionId: 'b', quantity: 1 }, { productVersionId: 'x', quantity: 1 }], menu)).toThrow(
      expect.objectContaining({ code: 'PRODUCTS_UNAVAILABLE', details: { productIds: ['p-a', 'p-b', 'x'] } }),
    );
  });

  it('si cambió el precio, devuelve la versión vigente para que el cliente la vea antes de confirmar', () => {
    const menu = [version('viejo', '1000', { current: { versionId: 'nuevo', name: 'Arepa', price: '1500.00', prepMinutes: 5 } })];
    expect(() => build([{ productVersionId: 'viejo', quantity: 1 }], menu)).toThrow(
      expect.objectContaining({ code: 'PRODUCTS_CHANGED', details: { changes: [{ productId: 'p-viejo', versionId: 'nuevo', price: '1500.00' }] } }),
    );
  });

  it('valida canasta vacía, cantidades y productos repetidos', () => {
    const menu = [version('a', '1000'), version('a2', '1000', { productId: 'p-a' })];
    expect(() => build([], menu)).toThrow(expect.objectContaining({ code: 'EMPTY_ORDER' }));
    expect(() => build([{ productVersionId: 'a', quantity: 21 }], menu)).toThrow(expect.objectContaining({ code: 'INVALID_QUANTITY' }));
    expect(() => build([{ productVersionId: 'a', quantity: 0 }], menu)).toThrow(expect.objectContaining({ code: 'INVALID_QUANTITY' }));
    expect(() => build([{ productVersionId: 'a', quantity: 1 }, { productVersionId: 'a', quantity: 1 }], menu)).toThrow(expect.objectContaining({ code: 'DUPLICATE_PRODUCT' }));
    expect(() => build([{ productVersionId: 'a', quantity: 1 }, { productVersionId: 'a2', quantity: 1 }], menu)).toThrow(expect.objectContaining({ code: 'DUPLICATE_PRODUCT' }));
  });

  describe('tope de cliente nuevo (RF-22)', () => {
    const menu = [version('a', '60000')];

    it('cuenta los productos, no el domicilio: 100.000 exactos sí se pueden pedir', () => {
      const checkout = build([{ productVersionId: 'a', quantity: 1 }], [version('a', '100000')]);
      expect(checkout.exceedsNewCustomerLimit).toBe(false);
      expect(() => checkout.assertWithinNewCustomerLimit()).not.toThrow();
    });

    it('descuenta lo que el cliente nuevo ya tiene en pedidos activos', () => {
      const checkout = build([{ productVersionId: 'a', quantity: 1 }], menu, { exposure: { deliveredOrders: 0, activeItemsCents: 5_000_000 } });
      expect(checkout.limit).toEqual({ limitCents: 10_000_000, availableCents: 5_000_000 });
      expect(() => checkout.assertWithinNewCustomerLimit()).toThrow(
        expect.objectContaining({ code: 'NEW_CUSTOMER_LIMIT', details: { limit: '100000.00', available: '50000.00' } }),
      );
    });

    it('no aplica a quien ya recibió un pedido ni cuando no hay tope configurado', () => {
      expect(build([{ productVersionId: 'a', quantity: 2 }], menu, { exposure: { deliveredOrders: 1, activeItemsCents: 0 } }).limit).toBeNull();
      expect(build([{ productVersionId: 'a', quantity: 2 }], menu, { newCustomerLimit: null }).exceedsNewCustomerLimit).toBe(false);
    });
  });
});
