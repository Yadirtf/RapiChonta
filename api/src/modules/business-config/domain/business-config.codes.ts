/**
 * Códigos de catálogo que usa el módulo business-config (Docs/14-base-de-datos/E03-zonas-horario-configuracion.md).
 * Los valores viven en la base de datos; aquí solo están los que tienen comportamiento en el código.
 */
export const ZONE_KINDS = {
  /** Barrios del casco urbano. */
  URBAN: 'URBAN',
  /** Veredas y lugares aledaños. */
  RURAL: 'RURAL',
  /**
   * Cobertura del municipio: hasta dónde llegan los domiciliarios, con una tarifa base. Puede contener barrios
   * y veredas (su tarifa propia gana); como máximo una activa por municipio.
   */
  COVERAGE: 'COVERAGE',
} as const;
export type ZoneKindCode = (typeof ZONE_KINDS)[keyof typeof ZONE_KINDS];
/** Lo que el administrador dibuja en la página Zonas; la cobertura tiene su propia página. */
export const FEE_ZONE_KINDS = [ZONE_KINDS.URBAN, ZONE_KINDS.RURAL] as const;

/** Cómo se trazó el área: a mano (vértices) o como radio alrededor de un centro. El área siempre es un polígono. */
export const ZONE_SHAPES = {
  POLYGON: 'POLYGON',
  CIRCLE: 'CIRCLE',
} as const;
export type ZoneShapeCode = (typeof ZONE_SHAPES)[keyof typeof ZONE_SHAPES];

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
  MUNICIPALITIES_MANAGE: 'municipalities.manage',
} as const;

export const BUSINESS_AUDIT_ACTIONS = {
  ZONE_CHANGED: 'ZONE_CHANGED',
  FEE_CHANGED: 'FEE_CHANGED',
  HOURS_CHANGED: 'HOURS_CHANGED',
  SETTING_CHANGED: 'SETTING_CHANGED',
  COMMISSION_CHANGED: 'COMMISSION_CHANGED',
  MUNICIPALITY_CHANGED: 'MUNICIPALITY_CHANGED',
} as const;

/** Códigos que deben existir para que la API arranque (se verifican al iniciar). */
export const REQUIRED_BUSINESS_CODES: Record<string, readonly string[]> = {
  zone_kinds: Object.values(ZONE_KINDS),
  zone_shapes: Object.values(ZONE_SHAPES),
  setting_data_types: Object.values(SETTING_DATA_TYPES),
  currencies: ['COP', ...DISPLAY_CURRENCIES],
  audit_actions: Object.values(BUSINESS_AUDIT_ACTIONS),
};
