/**
 * Códigos que usa el módulo de comercios aliados (Docs/14-base-de-datos/E13-E15-fases-futuras.md, E15).
 * Quién puede hacer cada cambio del pedido lo dice la máquina de estados en datos; aquí solo están los estados con
 * comportamiento propio del comercio.
 */
export const MERCHANT_ORDER_STATUSES = {
  /** El pedido directo nace aquí: el comercio lo acepta (con su tiempo) o lo rechaza. */
  AWAITING: 'AWAITING_MERCHANT',
  /** Aceptado: pasa al panel del despacho mientras el comercio prepara. */
  DISPATCH: 'PENDING_ASSIGNMENT',
  CANCELLED: 'CANCELLED',
  /** El domiciliario lo recogió: después de esto el "listo" ya no aplica. */
  PICKED_UP: 'ON_THE_WAY',
} as const;

export const MERCHANT_MODE = 'MERCHANT_DIRECT';

/** Abrir o pausar el local desde el portal: el comercio no lo publica ni lo da de baja (eso es del panel). */
export const STORE_STATUSES = { OPEN: 'ACTIVE', PAUSED: 'TEMPORARILY_CLOSED' } as const;

export const MERCHANT_PERMISSIONS = {
  RESPOND_ORDERS: 'store.respond_orders',
  MANAGE_STATUS: 'store.manage_status',
  /** Del administrador: convenios y quién del comercio entra al portal. */
  MANAGE_PARTNERS: 'partners.manage',
} as const;

/** Lo que el comercio puede prometer al aceptar; la base lo vuelve a exigir (CHECK). */
export const PREPARATION_MINUTES = { min: 1, max: 240 } as const;

/** Lo que muestra el portal además de lo que está en curso: lo cerrado en las últimas horas. */
export const CLOSED_WINDOW_HOURS = 12;

export const AGREEMENT_PURPOSE = 'PARTNERSHIP_AGREEMENT';
export const MERCHANT_ROLE = 'MERCHANT';
export const ORDER_READY_NOTICE = 'MERCHANT_ORDER_READY';
export const ACCEPTED_NOTICE = 'ORDER_STATUS_CHANGED';

export const MERCHANT_AUDIT = {
  PARTNERSHIP_CHANGED: 'PARTNERSHIP_CHANGED',
  STORE_STAFF_CHANGED: 'STORE_STAFF_CHANGED',
  ESTABLISHMENT_CHANGED: 'ESTABLISHMENT_CHANGED',
} as const;

/** Códigos que deben existir para que la API arranque (se verifican al iniciar). */
export const REQUIRED_MERCHANT_CODES: Record<string, readonly string[]> = {
  order_statuses: Object.values(MERCHANT_ORDER_STATUSES),
  fulfillment_modes: [MERCHANT_MODE],
  roles: [MERCHANT_ROLE],
  establishment_statuses: Object.values(STORE_STATUSES),
  file_purposes: [AGREEMENT_PURPOSE],
  notification_types: [ORDER_READY_NOTICE, ACCEPTED_NOTICE],
  audit_actions: Object.values(MERCHANT_AUDIT),
};
