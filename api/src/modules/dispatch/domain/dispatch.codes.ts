/**
 * Códigos de catálogo del despacho (Docs/14-base-de-datos/E07-asignacion.md). Qué estados del pedido llevan
 * domiciliario no está aquí: lo dice order_statuses.requires_courier.
 */
export const OFFER_MODES = {
  /** A un domiciliario elegido por el operador. */
  SPECIFIC: 'SPECIFIC',
  /** A todos los disponibles: el primero que acepta lo toma. */
  BROADCAST: 'BROADCAST',
} as const;
export type OfferModeCode = (typeof OFFER_MODES)[keyof typeof OFFER_MODES];

export const RECIPIENT_STATUSES = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type RecipientStatusCode = (typeof RECIPIENT_STATUSES)[keyof typeof RECIPIENT_STATUSES];

export const RELEASE_REASONS = {
  COURIER_RELEASED: 'COURIER_RELEASED',
  OPERATOR_REASSIGNED: 'OPERATOR_REASSIGNED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
} as const;

export const AVAILABILITY_END_REASONS = { TOGGLED_OFF: 'TOGGLED_OFF', INACTIVITY_TIMEOUT: 'INACTIVITY_TIMEOUT', ACCOUNT_DISABLED: 'ACCOUNT_DISABLED' } as const;

/** Por qué el pedido volvió al panel sin domiciliario. */
export const RETURN_SOURCES = {
  /** Nadie respondió antes del vencimiento (H07.4). */
  TIMER: 'TIMER',
  /** Todos los destinatarios dijeron "No puedo". */
  OFFERS_DECLINED: 'OFFERS_DECLINED',
} as const;

/** Las demás fuentes que usa el despacho (catálogo status_change_sources). */
export const DISPATCH_SOURCES = { USER_ACTION: 'USER_ACTION', ...RETURN_SOURCES } as const;

export const DISPATCH_PERMISSIONS = {
  READ_ALL: 'orders.read_all',
  ASSIGN: 'orders.assign',
  READ_LOCATIONS: 'couriers.read_location',
  RESPOND: 'offers.respond',
  REPORT_LOCATION: 'location.report',
  AUDIT: 'audit.read',
} as const;

export const OFFER_TIMEOUT_SETTING = 'offers.timeout_seconds';
export const LOCATION_RETENTION_SETTING = 'location.retention_days';
/** Documento que el domiciliario acepta antes de compartir su ubicación (H08.1, Ley 1581). */
export const LOCATION_CONSENT = 'COURIER_LOCATION_AUTHORIZATION';

/** Códigos que deben existir para que la API arranque (se verifican al iniciar). */
export const REQUIRED_DISPATCH_CODES: Record<string, readonly string[]> = {
  offer_modes: Object.values(OFFER_MODES),
  offer_recipient_statuses: Object.values(RECIPIENT_STATUSES),
  assignment_release_reasons: Object.values(RELEASE_REASONS),
  availability_end_reasons: Object.values(AVAILABILITY_END_REASONS),
  status_change_sources: Object.values(DISPATCH_SOURCES),
  notification_types: ['ORDER_OFFERED', 'OFFER_WITHDRAWN'],
  legal_document_types: [LOCATION_CONSENT],
};

/** Un turno Disponible sin ubicación por este tiempo (y sin pedido) se cierra solo: la app ya no está trabajando. */
export const AVAILABILITY_IDLE_MINUTES = 15;

/** Solo se ofrece a quien se vio en los últimos 2 minutos (H07.2). */
export const COURIER_FRESH_SECONDS = 120;
