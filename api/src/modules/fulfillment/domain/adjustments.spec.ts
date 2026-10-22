import { adjustmentOutcome, decisionOptions, DecisionRule, rankSubstitutes, reportProblem } from './adjustments';

const rule = (code: string, flags: Partial<DecisionRule> = {}): DecisionRule => ({
  code,
  removesItem: false,
  usesReportedPrice: false,
  createsSubstitute: false,
  cancelsOrder: false,
  isAutomatic: false,
  ...flags,
});
/** El catálogo de la semilla, en su orden. */
const RULES = [
  rule('SUBSTITUTE', { removesItem: true, createsSubstitute: true }),
  rule('REMOVE_ITEM', { removesItem: true }),
  rule('ACCEPT_PRICE', { usesReportedPrice: true }),
  rule('CANCEL_ORDER', { cancelsOrder: true }),
  rule('EXPIRED_REMOVED', { removesItem: true, isAutomatic: true }),
];

describe('Opciones cerradas del cliente (H09.3)', () => {
  it('sin el precio nuevo si el producto no está, y nunca la automática', () => {
    expect(decisionOptions(RULES, false)).toEqual(['SUBSTITUTE', 'REMOVE_ITEM', 'CANCEL_ORDER']);
    expect(decisionOptions(RULES, true)).toEqual(['SUBSTITUTE', 'REMOVE_ITEM', 'ACCEPT_PRICE', 'CANCEL_ORDER']);
  });
});

describe('Volver a la compra', () => {
  it('espera mientras falte una decisión, aunque otra ya cancele', () => {
    expect(adjustmentOutcome({ pending: 1, cancelled: true, effectiveLines: 2 })).toEqual({ kind: 'WAITING' });
  });

  it('cancelar gana; sin líneas no hay nada que comprar; si no, sigue la compra', () => {
    expect(adjustmentOutcome({ pending: 0, cancelled: true, effectiveLines: 3 })).toEqual({ kind: 'CANCEL', reason: 'CUSTOMER_REQUEST' });
    // Si venció el tiempo y era el único producto, el pedido se cancela.
    expect(adjustmentOutcome({ pending: 0, cancelled: false, effectiveLines: 0 })).toEqual({ kind: 'CANCEL', reason: 'ALL_ITEMS_UNAVAILABLE' });
    expect(adjustmentOutcome({ pending: 0, cancelled: false, effectiveLines: 1 })).toEqual({ kind: 'RESUME' });
  });
});

describe('Lo que reporta el domiciliario (H09.2)', () => {
  const prices = new Map([['a', '5000.00'], ['b', '1200.00']]);
  it('acepta faltantes y cambios de precio con su valor', () => {
    expect(reportProblem([{ orderItemId: 'a', reason: 'UNAVAILABLE' }, { orderItemId: 'b', reason: 'PRICE_CHANGED', unitPrice: '1500.50' }], prices)).toBeNull();
  });

  it('nombra el problema', () => {
    expect(reportProblem([], prices)).toBe('EMPTY');
    expect(reportProblem([{ orderItemId: 'a', reason: 'UNAVAILABLE' }, { orderItemId: 'a', reason: 'UNAVAILABLE' }], prices)).toBe('DUPLICATED');
    expect(reportProblem([{ orderItemId: 'b', reason: 'PRICE_CHANGED' }], prices)).toBe('PRICE_REQUIRED');
    expect(reportProblem([{ orderItemId: 'b', reason: 'PRICE_CHANGED', unitPrice: '0' }], prices)).toBe('PRICE_INVALID');
    expect(reportProblem([{ orderItemId: 'b', reason: 'PRICE_CHANGED', unitPrice: '1.234' }], prices)).toBe('PRICE_INVALID');
    expect(reportProblem([{ orderItemId: 'b', reason: 'PRICE_CHANGED', unitPrice: '1200' }], prices)).toBe('PRICE_UNCHANGED');
    expect(reportProblem([{ orderItemId: 'a', reason: 'UNAVAILABLE', unitPrice: '10' }], prices)).toBe('PRICE_NOT_ALLOWED');
    expect(reportProblem(Array.from({ length: 31 }, (_, i) => ({ orderItemId: `x${i}`, reason: 'UNAVAILABLE' as const })), prices)).toBe('TOO_MANY');
  });
});

describe('Sugerencias para "Cambiar por"', () => {
  const item = (productId: string, section: string, price: string, name = productId) => ({
    productId,
    productVersionId: `v-${productId}`,
    menuSectionId: section,
    name,
    price,
    imageFileId: null,
  });

  it('misma sección primero; dentro, el precio más parecido; a igual distancia, el más barato y luego el nombre', () => {
    const ranked = rankSubstitutes({ productId: 'burger', menuSectionId: 'hamburguesas', unitPrice: '15000.00' }, [
      item('perro', 'perros', '15000'),
      item('doble', 'hamburguesas', '19000'),
      item('sencilla', 'hamburguesas', '12000'),
      item('pollo', 'hamburguesas', '18000'),
      item('burger', 'hamburguesas', '15000'),
      item('mixta', 'hamburguesas', '18000', 'Arepa mixta'),
    ]);
    expect(ranked.map((c) => c.productId)).toEqual(['sencilla', 'mixta', 'pollo', 'doble', 'perro']);
    expect(ranked.map((c) => c.sameSection)).toEqual([true, true, true, true, false]);
  });
});
