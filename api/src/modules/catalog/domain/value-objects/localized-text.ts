import { CatalogErrors } from '../catalog.errors';
import { CONTENT_LANGUAGES, ContentLanguage, REQUIRED_LANGUAGE } from '../catalog.codes';

export type Translations<T> = Partial<Record<ContentLanguage, T>>;

/**
 * Textos que el personal escribe por idioma (RNF-03): el español es obligatorio, los demás opcionales.
 * Recorta espacios y descarta idiomas vacíos para no guardar filas sin contenido.
 */
export function normalizeNames(names: Translations<string> | undefined, max = 80, field = 'name'): Translations<string> {
  const result: Translations<string> = {};
  for (const language of CONTENT_LANGUAGES) {
    const value = names?.[language]?.trim().replace(/\s+/g, ' ');
    if (!value) continue;
    if (value.length > max) throw CatalogErrors.textTooLong(field, max);
    result[language] = value;
  }
  if (!result[REQUIRED_LANGUAGE]) throw CatalogErrors.spanishTextRequired();
  return result;
}

export interface ProductText {
  name: string;
  description: string | null;
}

export function normalizeProductTexts(texts: Translations<{ name?: string; description?: string | null }> | undefined): Translations<ProductText> {
  const result: Translations<ProductText> = {};
  for (const language of CONTENT_LANGUAGES) {
    const name = texts?.[language]?.name?.trim().replace(/\s+/g, ' ');
    const description = texts?.[language]?.description?.trim() || null;
    if (!name) continue;
    if (name.length > 120) throw CatalogErrors.textTooLong('name', 120);
    if (description && description.length > 600) throw CatalogErrors.textTooLong('description', 600);
    result[language] = { name, description };
  }
  if (!result[REQUIRED_LANGUAGE]) throw CatalogErrors.spanishTextRequired();
  return result;
}

export function sameProductTexts(a: Translations<ProductText>, b: Translations<ProductText>): boolean {
  return CONTENT_LANGUAGES.every(
    (l) => (a[l]?.name ?? null) === (b[l]?.name ?? null) && (a[l]?.description ?? null) === (b[l]?.description ?? null),
  );
}

/** Texto en el idioma pedido; si no existe, en español. */
export function pick<T>(values: Translations<T>, language: string): T | undefined {
  return values[language as ContentLanguage] ?? values[REQUIRED_LANGUAGE];
}
