import { categoryCode } from './category-code';
import { normalizeNames, normalizeProductTexts, pick, sameProductTexts } from './localized-text';

describe('textos por idioma', () => {
  it('exige el español, recorta espacios y descarta idiomas vacíos', () => {
    expect(normalizeNames({ es: '  Bebidas   frías ', en: '  ' })).toEqual({ es: 'Bebidas frías' });
    expect(() => normalizeNames({ en: 'Drinks' })).toThrow(expect.objectContaining({ code: 'SPANISH_TEXT_REQUIRED' }));
    expect(() => normalizeNames({ es: 'x'.repeat(81) })).toThrow(expect.objectContaining({ code: 'TEXT_TOO_LONG' }));
  });

  it('normaliza nombre y descripción del producto y los compara', () => {
    const a = normalizeProductTexts({ es: { name: 'Pollo  asado', description: ' ' }, en: { name: 'Roast chicken' } });
    expect(a).toEqual({ es: { name: 'Pollo asado', description: null }, en: { name: 'Roast chicken', description: null } });
    expect(sameProductTexts(a, { es: { name: 'Pollo asado', description: null }, en: { name: 'Roast chicken', description: null } })).toBe(true);
    expect(sameProductTexts(a, { es: { name: 'Pollo asado', description: null } })).toBe(false);
  });

  it('elige el idioma pedido o cae al español', () => {
    expect(pick({ es: 'Bebidas', en: 'Drinks' }, 'en')).toBe('Drinks');
    expect(pick({ es: 'Bebidas' }, 'en')).toBe('Bebidas');
  });

  it('genera códigos de categoría estables desde el nombre', () => {
    expect(categoryCode('Panaderías y cafés')).toBe('PANADERIAS_Y_CAFES');
    expect(categoryCode('fast_food')).toBe('FAST_FOOD');
    expect(() => categoryCode('¡!')).toThrow(expect.objectContaining({ code: 'INVALID_CATEGORY_CODE' }));
  });
});
