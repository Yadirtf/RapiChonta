import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { CatalogErrors } from '../catalog.errors';

/** Teléfono del local (fijo o celular) en E.164, para que el domiciliario u operador llame. */
export function establishmentPhone(raw: string): string {
  const parsed = parsePhoneNumberFromString(raw?.trim() ?? '', 'CO');
  if (!parsed || !parsed.isValid()) throw CatalogErrors.invalidPhone();
  return parsed.number;
}

export function cleanText(value: string, max: number, field: string): string {
  const text = (value ?? '').trim().replace(/\s+/g, ' ');
  if (text.length > max) throw CatalogErrors.textTooLong(field, max);
  return text;
}

/** Categorías sin repetir; la primera es la principal (ícono del mapa). */
export function normalizeCategories(codes: string[] | undefined): string[] {
  const unique = [...new Set((codes ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (!unique.length) throw CatalogErrors.categoryRequired();
  return unique.slice(0, 5);
}
