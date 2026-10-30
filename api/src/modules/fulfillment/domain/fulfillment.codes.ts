import { ADJUSTMENT_DECISIONS, ADJUSTMENT_NOTICES, ADJUSTMENT_REASONS, CANCELLATION_REASONS } from './adjustments';
import { INCIDENT_NOTICES, INCIDENT_RESOLUTIONS, INCIDENT_STATUSES, INCIDENT_TYPES } from './incidents';

/**
 * Lo que el domiciliario hace con el pedido después de tomarlo (Docs/14-base-de-datos/E08-modo-domiciliario.md).
 * Estados que este módulo nombra porque tiene comportamiento propio con ellos (geocercas, compra y preparación);
 * quién puede hacer cada cambio lo dice la máquina de estados del catálogo (order_status_transitions).
 */
export const TRIP_STATUSES = {
  /** Lo tomó: va al local. La geocerca del local lo pasa a AT_ESTABLISHMENT. */
  ACCEPTED: 'ACCEPTED',
  /** En el local: registra la compra con la factura, o consulta al cliente si falta algo (E09). */
  AT_ESTABLISHMENT: 'AT_ESTABLISHMENT',
  /** Esperando la decisión del cliente sobre un producto faltante o con otro precio (E09). */
  AWAITING_CUSTOMER: 'AWAITING_CUSTOMER',
  /** Pagó y espera que el local entregue. */
  PREPARING: 'PREPARING',
  /** Va donde el cliente. La distancia al punto de entrega lo pasa a ARRIVING. */
  ON_THE_WAY: 'ON_THE_WAY',
  /** Donde el cliente: entrega con el código que le dice el cliente, o con foto si no lo obtiene. */
  ARRIVING: 'ARRIVING',
  /** Entregó con foto: queda libre; el cliente confirma o reclama, y si nadie reclama se cierra solo. */
  PENDING_REVIEW: 'PENDING_REVIEW',
  DISPUTED: 'DISPUTED',
  DELIVERED: 'DELIVERED',
  /** E09: el cliente canceló desde la consulta, o no quedó nada que comprar. */
  CANCELLED: 'CANCELLED',
} as const;
export type TripStatusCode = (typeof TRIP_STATUSES)[keyof typeof TRIP_STATUSES];

/** Por qué medio llegó el cambio (catálogo status_change_sources). */
export const TRIP_SOURCES = {
  USER_ACTION: 'USER_ACTION',
  /** Hecho sin señal y enviado después desde la cola de la app (H08.8). */
  OFFLINE_SYNC: 'OFFLINE_SYNC',
  GEOFENCE: 'GEOFENCE',
  /** Cierre automático de una entrega con foto que nadie reclamó. */
  TIMER: 'TIMER',
} as const;

export const FULFILLMENT_PERMISSIONS = {
  PROGRESS: 'orders.progress',
  /** El cliente: "Recibí mi pedido". */
  CONFIRM_DELIVERY: 'orders.confirm_delivery',
  /** El cliente: "No lo recibí" después de una entrega con foto. */
  REPORT_INCIDENT: 'incidents.report',
  /** E09: el domiciliario reporta un faltante; el cliente decide. */
  REPORT_ADJUSTMENT: 'adjustments.report',
  DECIDE_ADJUSTMENT: 'adjustments.decide',
} as const;

export const FULFILLMENT_SETTINGS = {
  CONSECUTIVE_READINGS: 'geofence.consecutive_readings',
  ARRIVING_METERS: 'delivery.arriving_meters',
  RECHECK_SECONDS: 'preparation.recheck_seconds',
  PROOF_AFTER_SECONDS: 'delivery.proof_after_seconds',
  REVIEW_AUTO_CLOSE_SECONDS: 'delivery.review_auto_close_seconds',
} as const;

/** Valores si el municipio no tiene la configuración (los mismos de la semilla). */
export const DEFAULT_PROOF_AFTER_SECONDS = 300;
export const DEFAULT_REVIEW_AUTO_CLOSE_SECONDS = 7200;
/** Códigos equivocados antes de bloquear el código: 5 de 10.000 combinaciones; después queda la foto. */
export const DELIVERY_CODE_MAX_ATTEMPTS = 5;

/** Lecturas con precisión peor que esto no cuentan para geocercas (Docs/14 E08). */
export const GEOFENCE_MAX_ACCURACY_M = 50;
/** Solo cuentan lecturas recientes: una lectura vieja que llega desde la cola sin señal no dispara llegadas. */
export const GEOFENCE_FRESH_SECONDS = 120;

/**
 * E15: cómo se cumple el pedido. En el directo el comercio aliado lo prepara: el domiciliario no compra ni consulta
 * faltantes; al recogerlo le paga al comercio lo que vale el pedido (un PURCHASE sin factura) y sale.
 */
export const TRIP_MODES = { COURIER_PURCHASE: 'COURIER_PURCHASE', MERCHANT_DIRECT: 'MERCHANT_DIRECT' } as const;
export type TripModeCode = (typeof TRIP_MODES)[keyof typeof TRIP_MODES];

export const PURCHASE_MOVEMENT = 'PURCHASE';
/** H10.2: lo que pagó el cliente, un movimiento por medio. */
export const COLLECTION_MOVEMENT = 'COLLECTION';
/** La imagen del QR de la cuenta del domiciliario (Nequi, Daviplata, banco). */
export const COLLECTION_QR_PURPOSE = 'COLLECTION_QR';
export const RECEIPT_PURPOSE = 'PURCHASE_RECEIPT';
export const PREPARATION_NOTICE = 'PREPARATION_TIME_REACHED';
export const PROOF_PURPOSE = 'DELIVERY_PROOF';
export const COMPLETED_RELEASE = 'ORDER_COMPLETED';
export const CANCELLED_RELEASE = 'ORDER_CANCELLED';
/** Al domiciliario: el pedido que llevaba se canceló (ya no tiene que comprarlo). */
export const TRIP_CANCELLED_NOTICE = 'TRIP_CANCELLED';

/** Códigos que deben existir para que la API arranque (se verifican al iniciar). */
export const REQUIRED_FULFILLMENT_CODES: Record<string, readonly string[]> = {
  order_statuses: Object.values(TRIP_STATUSES),
  status_change_sources: Object.values(TRIP_SOURCES),
  cash_movement_types: [PURCHASE_MOVEMENT, COLLECTION_MOVEMENT],
  file_purposes: [RECEIPT_PURPOSE, PROOF_PURPOSE, COLLECTION_QR_PURPOSE],
  notification_types: [PREPARATION_NOTICE, TRIP_CANCELLED_NOTICE, ...Object.values(ADJUSTMENT_NOTICES), ...Object.values(INCIDENT_NOTICES)],
  assignment_release_reasons: [COMPLETED_RELEASE, CANCELLED_RELEASE],
  adjustment_reasons: Object.values(ADJUSTMENT_REASONS),
  adjustment_decisions: Object.values(ADJUSTMENT_DECISIONS),
  cancellation_reasons: Object.values(CANCELLATION_REASONS),
  incident_types: Object.values(INCIDENT_TYPES),
  incident_statuses: Object.values(INCIDENT_STATUSES),
  incident_resolution_types: Object.values(INCIDENT_RESOLUTIONS),
};
