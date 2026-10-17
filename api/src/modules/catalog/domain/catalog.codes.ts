/**
 * Códigos de catálogo que el programa usa (Docs/14-base-de-datos/E02-establecimientos-y-menus.md).
 * La lista completa, sus marcas (is_visible_on_map, accepts_orders, is_orderable…) y las transiciones
 * permitidas viven en la base de datos; aquí solo están los códigos con comportamiento en el código.
 */
export const ESTABLISHMENT_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  TEMPORARILY_CLOSED: 'TEMPORARILY_CLOSED',
  INACTIVE: 'INACTIVE',
} as const;
export type EstablishmentStatusCode = (typeof ESTABLISHMENT_STATUSES)[keyof typeof ESTABLISHMENT_STATUSES];

export const PRODUCT_STATUSES = {
  AVAILABLE: 'AVAILABLE',
  SOLD_OUT: 'SOLD_OUT',
  DISCONTINUED: 'DISCONTINUED',
} as const;
export type ProductStatusCode = (typeof PRODUCT_STATUSES)[keyof typeof PRODUCT_STATUSES];

export const CATALOG_PERMISSIONS = {
  ESTABLISHMENTS_MANAGE: 'establishments.manage',
  PRODUCTS_MANAGE: 'products.manage',
  CATEGORIES_MANAGE: 'categories.manage',
} as const;

/** Idiomas de los textos que escribe el personal. El español es obligatorio (fn_product_version_requires_es). */
export const CONTENT_LANGUAGES = ['es', 'en'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export const REQUIRED_LANGUAGE: ContentLanguage = 'es';

export const CATALOG_AUDIT_ACTIONS = {
  ESTABLISHMENT_CHANGED: 'ESTABLISHMENT_CHANGED',
  PRODUCT_CHANGED: 'PRODUCT_CHANGED',
  CATEGORY_CHANGED: 'CATEGORY_CHANGED',
} as const;

/** Códigos que deben existir para que la API arranque (se verifican al iniciar). */
export const REQUIRED_CATALOG_CODES: Record<string, readonly string[]> = {
  establishment_statuses: Object.values(ESTABLISHMENT_STATUSES),
  product_statuses: Object.values(PRODUCT_STATUSES),
  file_purposes: ['PRODUCT_IMAGE', 'ESTABLISHMENT_LOGO'],
  audit_actions: Object.values(CATALOG_AUDIT_ACTIONS),
  languages: CONTENT_LANGUAGES,
};
