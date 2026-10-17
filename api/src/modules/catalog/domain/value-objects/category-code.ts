import { CatalogErrors } from '../catalog.errors';

const PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;

/** Código estable de una categoría (SCREAMING_SNAKE_CASE). Se genera del nombre si no se da. */
export function categoryCode(input: string): string {
  const code = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!PATTERN.test(code)) throw CatalogErrors.invalidCategoryCode();
  return code;
}

/** Íconos que la web y la app saben dibujar (lucide en la web; equivalentes de Material en la app). */
export const CATEGORY_ICONS = [
  'utensils-crossed',
  'store',
  'shopping-basket',
  'package',
  'pill',
  'pizza',
  'beef',
  'coffee',
  'croissant',
  'ice-cream-cone',
  'beer',
  'sandwich',
  'fish',
  'salad',
  'apple',
  'cake-slice',
  'shirt',
  'hammer',
  'dog',
  'flower',
  'gift',
  'smartphone',
  'book-open',
  'sparkles',
] as const;
