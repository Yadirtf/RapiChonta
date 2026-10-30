import { DomainError } from '../../../shared/domain/domain.error';
import { Pesos } from './pesos';
import { amountDue, cleanNote, closingDifference, MovementTotal, parseBusinessDate, parseReceived } from './settlement';

const code = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return (error as DomainError).code;
  }
  return null;
};

const totals = (rows: [string, 1 | -1, string][]): MovementTotal[] => rows.map(([type, direction, total]) => ({ type, direction, total, count: 1 }));
const methods = [
  { code: 'CASH', isAccountBased: false },
  { code: 'NEQUI', isAccountBased: true },
];

describe('Pesos (decimal exacto con signo)', () => {
  it('suma sin punto flotante: 0,1 + 0,2 es 0,3', () => {
    expect(Pesos.of('0.1').plus(Pesos.of('0.2')).toString()).toBe('0.30');
    expect(Pesos.sum(Array.from({ length: 10 }, () => Pesos.of('0.10'))).toString()).toBe('1.00');
  });

  it('lleva el signo y lo muestra con dos cifras', () => {
    expect(Pesos.of('1500').times(-1).toString()).toBe('-1500.00');
    expect(Pesos.of('-0.05').toString()).toBe('-0.05');
    expect(Pesos.of('2000.5').minus(Pesos.of('2000.75')).toString()).toBe('-0.25');
  });

  it('rechaza lo que no es un monto', () => {
    for (const bad of ['', 'abc', '1,5', '1.234', '01', '1e3', '12345678901']) expect(Pesos.parse(bad)).toBeNull();
  });
});

describe('Lo que debe entregar (RF-72)', () => {
  // Base 50.000; dos pedidos: compras 30.000 + 18.250,50; cobros con tarifas de 3.000 y 4.500; comisión 15 %.
  const fees = '7500.00';
  const commissions = '1125.00';

  it('CASH_BOX: base + comisiones', () => {
    const due = amountDue(
      totals([
        ['OPENING', 1, '50000.00'],
        ['PURCHASE', -1, '48250.50'],
        ['COLLECTION', 1, '55750.50'],
      ]),
      fees,
      commissions,
    );
    expect(due).toEqual({ movementsNet: '57500.00', courierFees: '7500.00', commissions: '1125.00', amountDue: '51125.00' });
  });

  it('OWN_FUNDS: solo comisiones', () => {
    const due = amountDue(
      totals([
        ['PURCHASE', -1, '48250.50'],
        ['COLLECTION', 1, '55750.50'],
      ]),
      fees,
      commissions,
    );
    expect(due.amountDue).toBe('1125.00');
  });

  it('lo entregado y los ajustes bajan o suben lo debido', () => {
    const due = amountDue(
      totals([
        ['OPENING', 1, '50000.00'],
        ['PURCHASE', -1, '48250.50'],
        ['COLLECTION', 1, '55750.50'],
        ['RETURN', -1, '51000.00'],
        ['ADJUSTMENT_OUT', -1, '125.00'],
      ]),
      fees,
      commissions,
    );
    expect(due.amountDue).toBe('0.00');
  });

  it('un cliente que pagó de menos baja lo debido; puede quedar negativo (RapiChonta le debe al domiciliario)', () => {
    const short = amountDue(totals([['PURCHASE', -1, '20000'], ['COLLECTION', 1, '22000']]), '3000', '450');
    expect(short.amountDue).toBe('-550.00');
  });
});

describe('Cierre', () => {
  it('la diferencia es lo debido menos lo recibido: faltante, sobrante o cuadra', () => {
    const received = parseReceived([{ paymentMethod: 'CASH', amount: '40000' }, { paymentMethod: 'NEQUI', amount: '11125.00' }], methods);
    expect(closingDifference('51125.00', received).isZero()).toBe(true);
    expect(closingDifference('51125.00', received.slice(0, 1)).toString()).toBe('11125.00');
    expect(closingDifference('1125.00', received).toString()).toBe('-50000.00');
  });

  it('sin entregar nada es válido (la diferencia es todo lo debido)', () => {
    expect(closingDifference('1125.00', parseReceived([], methods)).toString()).toBe('1125.00');
  });

  it('valida medio, repetidos y montos', () => {
    expect(code(() => parseReceived([{ paymentMethod: 'BITCOIN', amount: '1' }], methods))).toBe('CASH_PAYMENT_METHOD_INVALID');
    expect(code(() => parseReceived([{ paymentMethod: 'CASH', amount: '1' }, { paymentMethod: 'CASH', amount: '2' }], methods))).toBe('CASH_PAYMENT_METHOD_REPEATED');
    expect(code(() => parseReceived([{ paymentMethod: 'CASH', amount: '0' }], methods))).toBe('CASH_AMOUNT_INVALID');
    expect(code(() => parseReceived(Array.from({ length: 4 }, (_, i) => ({ paymentMethod: `M${i}`, amount: '1' })), methods))).toBe('CASH_TOO_MANY_METHODS');
  });
});

describe('Entradas del panel', () => {
  it('una nota útil, sin espacios de más', () => {
    expect(cleanNote('  faltó   el  vuelto ')).toBe('faltó el vuelto');
    expect(cleanNote('ok')).toBeNull();
    expect(cleanNote(undefined)).toBeNull();
  });

  it('fechas del calendario', () => {
    expect(parseBusinessDate('2026-10-30')).toBe('2026-10-30');
    expect(parseBusinessDate('2026-02-30')).toBeNull();
    expect(parseBusinessDate('30/10/2026')).toBeNull();
  });
});
