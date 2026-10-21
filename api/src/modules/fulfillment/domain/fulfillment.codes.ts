/**
 * Lo que el domiciliario hace con el pedido después de tomarlo (Docs/14-base-de-datos/E08-modo-domiciliario.md).
 * Estados que este módulo nombra porque tiene comportamiento propio con ellos (geocercas, compra y preparación);
 * quién puede hacer cada cambio lo dice la máquina de estados del catálogo (order_status_transitions).
 */
export const TRIP_STATUSES = {
  /** Lo tomó: va al local. La geocerca del local lo pasa a AT_ESTABLISHMENT. */
  ACCEPTED: 'ACCEPTED',
  /** En el local: registra la compra con la factura. */
  AT_ESTABLISHMENT: 'AT_ESTABLISHMENT',
  /** Pagó y espera que el local entregue. */
  PREPARING: 'PREPARING',
  /** Va donde el cliente. La distancia al punto de entrega lo pasa a ARRIVING. */
  ON_THE_WAY: 'ON_THE_WAY',
  ARRIVING: 'ARRIVING',
} as const;
export type TripStatusCode = (typeof TRIP_STATUSES)[keyof typeof TRIP_STATUSES];

/** Por qué medio llegó el cambio (catálogo status_change_sources). */
export const TRIP_SOURCES = {
  USER_ACTION: 'USER_ACTION',
  /** Hecho sin señal y enviado después desde la cola de la app (H08.8). */
  OFFLINE_SYNC: 'OFFLINE_SYNC',
  GEOFENCE: 'GEOFENCE',
} as const;

export const FULFILLMENT_PERMISSIONS = {
  PROGRESS: 'orders.progress',
} as const;

export const FULFILLMENT_SETTINGS = {
  CONSECUTIVE_READINGS: 'geofence.consecutive_readings',
  ARRIVING_METERS: 'delivery.arriving_meters',
  RECHECK_SECONDS: 'preparation.recheck_seconds',
} as const;

/** Lecturas con precisión peor que esto no cuentan para geocercas (Docs/14 E08). */
export const GEOFENCE_MAX_ACCURACY_M = 50;
/** Solo cuentan lecturas recientes: una lectura vieja que llega desde la cola sin señal no dispara llegadas. */
export const GEOFENCE_FRESH_SECONDS = 120;

export const PURCHASE_MOVEMENT = 'PURCHASE';
export const RECEIPT_PURPOSE = 'PURCHASE_RECEIPT';
export const PREPARATION_NOTICE = 'PREPARATION_TIME_REACHED';

/** Códigos que deben existir para que la API arranque (se verifican al iniciar). */
export const REQUIRED_FULFILLMENT_CODES: Record<string, readonly string[]> = {
  order_statuses: Object.values(TRIP_STATUSES),
  status_change_sources: Object.values(TRIP_SOURCES),
  cash_movement_types: [PURCHASE_MOVEMENT],
  file_purposes: [RECEIPT_PURPOSE],
  notification_types: [PREPARATION_NOTICE],
};
