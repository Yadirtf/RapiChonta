import { formatCents, resolveCollection, totalCents } from './collection';
import { resolutionFits } from './incidents';

const METHODS = [
  { code: 'CASH', isAccountBased: false, accountId: null },
  { code: 'NEQUI', isAccountBased: true, accountId: 'n-1' },
  { code: 'BANK_TRANSFER', isAccountBased: true, accountId: null },
];

describe('Cobro contra entrega (H10.2)', () => {
  it('un pago en efectivo no lleva cuenta; uno por Nequi lleva la del domiciliario', () => {
    expect(resolveCollection([{ paymentMethod: 'CASH', amount: '42000' }, { paymentMethod: 'NEQUI', amount: '500.5' }], METHODS)).toEqual({
      ok: true,
      payments: [
        { paymentMethod: 'CASH', amount: '42000', collectionAccountId: null },
        { paymentMethod: 'NEQUI', amount: '500.5', collectionAccountId: 'n-1' },
      ],
    });
  });

  it('cada problema tiene su código', () => {
    const problem = (payments: { paymentMethod: string; amount: string }[]) => {
      const r = resolveCollection(payments, METHODS);
      return r.ok ? null : r.problem;
    };
    expect(problem([])).toBe('EMPTY');
    expect(problem([{ paymentMethod: 'CASH', amount: '1' }, { paymentMethod: 'NEQUI', amount: '1' }, { paymentMethod: 'BANK_TRANSFER', amount: '1' }, { paymentMethod: 'X', amount: '1' }])).toBe('TOO_MANY');
    expect(problem([{ paymentMethod: 'CASH', amount: '12,5' }])).toBe('AMOUNT');
    expect(problem([{ paymentMethod: 'CASH', amount: '0.00' }])).toBe('AMOUNT');
    expect(problem([{ paymentMethod: 'CASH', amount: '1' }, { paymentMethod: 'CASH', amount: '2' }])).toBe('REPEATED_METHOD');
    expect(problem([{ paymentMethod: 'PAYPAL', amount: '1' }])).toBe('METHOD');
    expect(problem([{ paymentMethod: 'BANK_TRANSFER', amount: '1' }])).toBe('NO_ACCOUNT');
  });

  it('suma en centavos sin flotantes', () => {
    expect(totalCents([{ amount: '0.1' }, { amount: '0.2' }, { amount: '41999.7' }])).toBe(4_200_000);
    expect(formatCents(4_200_005)).toBe('42000.05');
  });
});

describe('Resolución de una novedad', () => {
  it('la que tiene al pedido en disputa debe dejarlo entregado o cancelado; un reclamo sin disputa no lo cambia', () => {
    expect(resolutionFits(true, 'DELIVERED')).toBe(true);
    expect(resolutionFits(true, null)).toBe(false);
    expect(resolutionFits(false, null)).toBe(true);
    expect(resolutionFits(false, 'CANCELLED')).toBe(false);
  });
});
