import { ORDER_CODE_PATTERN, OrderCode } from './order-code';

describe('OrderCode', () => {
  it('genera RC- con 4 caracteres sin letras ambiguas y alarga a partir del tercer reintento', () => {
    for (let i = 0; i < 200; i++) expect(OrderCode.generate()).toMatch(/^RC-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(OrderCode.generate(3)).toMatch(/^RC-.{5}$/);
    expect(OrderCode.generate(20)).toMatch(ORDER_CODE_PATTERN);
    expect(OrderCode.generate(0, () => 31)).toBe('RC-ZZZZ');
  });

  it('normaliza lo que escribe el cliente', () => {
    expect(OrderCode.normalize('rc 7k3m')).toBe('RC-7K3M');
    expect(OrderCode.normalize('7K3M')).toBe('RC-7K3M');
    expect(OrderCode.normalize('RC-OIL1')).toBeNull();
    expect(OrderCode.normalize('')).toBeNull();
  });
});
