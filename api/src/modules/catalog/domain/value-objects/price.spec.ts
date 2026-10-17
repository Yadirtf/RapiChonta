import { assertPrepMinutes, Price } from './price';

describe('Price', () => {
  it.each([
    ['18000', '18000.00'],
    ['3500.5', '3500.50'],
    ['0.01', '0.01'],
    [' 9999999999.99 ', '9999999999.99'],
    [12000, '12000.00'],
  ])('%p → %p sin pasar por punto flotante', (input, expected) => {
    expect(Price.parse(input).toDecimalString()).toBe(expected);
  });

  it.each(['0', '0.00', '-5', '12,000', '1.999', 'abc', '', '12345678901'])('rechaza %p', (input) => {
    expect(() => Price.parse(input)).toThrow(expect.objectContaining({ code: 'INVALID_PRICE' }));
  });

  it('compara por valor', () => {
    expect(Price.parse('18000').equals(Price.parse('18000.00'))).toBe(true);
    expect(Price.parse('18000').equals(Price.parse('18000.01'))).toBe(false);
  });

  it('valida el tiempo de preparación entre 0 y 240 minutos', () => {
    expect(assertPrepMinutes(0)).toBe(0);
    expect(() => assertPrepMinutes(241)).toThrow(expect.objectContaining({ code: 'INVALID_PREP_MINUTES' }));
    expect(() => assertPrepMinutes(1.5)).toThrow(expect.objectContaining({ code: 'INVALID_PREP_MINUTES' }));
  });
});
