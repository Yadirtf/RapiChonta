/**
 * Códigos de catálogo que usa el módulo business-config (Docs/14-base-de-datos/E03-zonas-horario-configuracion.md).
 * Los valores viven en la base de datos; aquí solo están los que tienen comportamiento en el código.
 */
export const ZONE_KINDS = {
  /** Barrios del casco urbano. */
  URBAN: 'URBAN',
  /** Veredas y lugares aledaños. */
  RURAL: 'RURAL',
} as const;
export type ZoneKindCode = (typeof ZONE_KINDS)[keyof typeof ZONE_KINDS];

export const SETTING_DATA_TYPES = {
  INTEGER: 'INTEGER',
  MONEY_COP: 'MONEY_COP',
  SECONDS: 'SECONDS',
  METERS: 'METERS',
  DAYS: 'DAYS',
} as const;
export type SettingDataTypeCode = (typeof SETTING_DATA_TYPES)[keyof typeof SETTING_DATA_TYPES];

/** Monedas para mostrar el precio aproximado (H03.4). El cobro siempre es en COP. */
export const DISPLAY_CURRENCIES = ['USD', 'EUR'] as const;
export type DisplayCurrencyCode = (typeof DISPLAY_CURRENCIES)[number];

export const BUSINESS_PERMISSIONS = {
  ZONES_MANAGE: 'zones.manage',
  HOURS_MANAGE: 'hours.manage',
  SETTINGS_MANAGE: 'settings.manage',
  COMMISSION_MANAGE: 'commission.manage',
} as const;

export const BUSINESS_AUDIT_ACTIONS = {
  ZONE_CHANGED: 'ZONE_CHANGED',
  FEE_CHANGED: 'FEE_CHANGED',
  HOURS_CHANGED: 'HOURS_CHANGED',
  SETTING_CHANGED: 'SETTING_CHANGED',
  COMMISSION_CHANGED: 'COMMISSION_CHANGED',
} as const;

/** Códigos que deben existir para que la API arranque (se verifican al iniciar). */
export const REQUIRED_BUSINESS_CODES: Record<string, readonly string[]> = {
  zone_kinds: Object.values(ZONE_KINDS),
  setting_data_types: Object.values(SETTING_DATA_TYPES),
  currencies: ['COP', ...DISPLAY_CURRENCIES],
  audit_actions: Object.values(BUSINESS_AUDIT_ACTIONS),
};
