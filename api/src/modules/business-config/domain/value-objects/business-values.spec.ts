import { CommissionPercent, parseSettingValue, trimDecimal } from './business-values';

describe('Comisión (RF-73)', () => {
  it('convierte el porcentaje a tasa sin punto flotante', () => {
    expect(CommissionPercent.parse('12,5').toRate()).toBe('0.1250');
    expect(CommissionPercent.parse(0).toRate()).toBe('0.0000');
    expect(CommissionPercent.parse('99.99').toRate()).toBe('0.9999');
    expect(CommissionPercent.fromRate('0.1250').toPercentString()).toBe('12.50');
    expect(CommissionPercent.parse('0.1').toPercentString()).toBe('0.10');
  });

  it('rechaza valores fuera de 0 a 99,99 % o con más de 2 decimales', () => {
    for (const bad of ['100', '-1', '12.345', 'abc', '', Number.NaN]) {
      expect(() => CommissionPercent.parse(bad)).toThrow(expect.objectContaining({ code: 'INVALID_COMMISSION' }));
    }
  });
});

describe('Parámetros del negocio (RF-16)', () => {
  it('acepta enteros dentro del rango', () => {
    expect(parseSettingValue('SECONDS', '90', '15.0000', '600.0000')).toBe('90');
    expect(parseSettingValue('MONEY_COP', 150000, '0.0000', null)).toBe('150000');
  });

  it('rechaza decimales, negativos y valores fuera de rango con el rango en el detalle', () => {
    expect(() => parseSettingValue('SECONDS', '10', '15.0000', '600.0000')).toThrow(
      expect.objectContaining({ code: 'INVALID_SETTING_VALUE', details: { min: '15', max: '600' } }),
    );
    expect(() => parseSettingValue('SECONDS', '601', '15.0000', '600.0000')).toThrow(expect.objectContaining({ code: 'INVALID_SETTING_VALUE' }));
    expect(() => parseSettingValue('INTEGER', '2.5', null, null)).toThrow(expect.objectContaining({ code: 'INVALID_SETTING_VALUE' }));
    expect(() => parseSettingValue('INTEGER', '-3', null, null)).toThrow(expect.objectContaining({ code: 'INVALID_SETTING_VALUE' }));
  });

  it('muestra los decimales de la base sin ceros sobrantes', () => {
    expect(trimDecimal('100000.0000')).toBe('100000');
    expect(trimDecimal('0.5000')).toBe('0.5');
  });
});
