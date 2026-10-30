/**
 * Códigos de catálogo que usa el módulo de pedidos (Docs/14-base-de-datos/E04-pedido-del-cliente.md).
 * Los estados del pedido no están aquí: el código usa sus marcas (is_initial, is_terminal,
 * is_visible_to_customer, is_milestone, counts_as_delivered), así que agregar un estado es una fila nueva.
 */
export const FULFILLMENT_MODES = {
  /** MVP: el domiciliario compra en nombre del cliente. */
  COURIER_PURCHASE: 'COURIER_PURCHASE',
  /** E15: el comercio aliado recibe el pedido y lo prepara; el domiciliario lo recoge. Solo en locales aliados. */
  MERCHANT_DIRECT: 'MERCHANT_DIRECT',
} as const;
export type FulfillmentModeCode = (typeof FULFILLMENT_MODES)[keyof typeof FULFILLMENT_MODES];
/** Lo que entiende un cliente que no manda el modo (la app de antes de E15): la compra por RapiChonta. */
export const DEFAULT_FULFILLMENT_MODE: FulfillmentModeCode = FULFILLMENT_MODES.COURIER_PURCHASE;

export const STATUS_CHANGE_SOURCES = {
  USER_ACTION: 'USER_ACTION',
} as const;

export const ORDER_PERMISSIONS = {
  CREATE: 'orders.create',
  READ_OWN: 'orders.read_own',
} as const;

/** Los medios de pago son parámetros del negocio: los administra quien tiene settings.manage. */
export const PAYMENT_OPTIONS_PERMISSION = 'settings.manage';
export const PAYMENT_METHOD_IMAGE_PURPOSE = 'PAYMENT_METHOD_IMAGE';
export const PAYMENT_METHOD_CHANGED = 'PAYMENT_METHOD_CHANGED';

/** Tope del carrito para clientes sin pedidos entregados (RF-22), por municipio. */
export const NEW_CUSTOMER_LIMIT_SETTING = 'orders.new_customer_max_cop';

/** Códigos que deben existir para que la API arranque (se verifican al iniciar). */
export const REQUIRED_ORDER_CODES: Record<string, readonly string[]> = {
  fulfillment_modes: Object.values(FULFILLMENT_MODES),
  status_change_sources: Object.values(STATUS_CHANGE_SOURCES),
  roles: ['CUSTOMER'],
  file_purposes: [PAYMENT_METHOD_IMAGE_PURPOSE],
  audit_actions: [PAYMENT_METHOD_CHANGED],
};
