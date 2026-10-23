import { INCIDENT_RESOLUTIONS, INCIDENT_STATUSES, INCIDENT_TYPES } from '../../fulfillment/domain/incidents';

/**
 * Módulo `operations` (Docs/14-base-de-datos/E10 · Alertas del panel, H10.5): los pedidos en curso del municipio con
 * sus alertas, la línea de tiempo de cada uno, la revisión de las entregas con foto, las novedades y la cancelación.
 */
export const OPERATIONS_PERMISSIONS = {
  READ_ALL: 'orders.read_all',
  CANCEL: 'orders.cancel',
  REVIEW_PROOF: 'deliveries.review',
  RESOLVE_INCIDENT: 'incidents.resolve',
} as const;

/**
 * Alertas de v_active_order_alerts, de la más urgente a la menos: el panel ordena por la primera y la campana suena
 * distinto con las de prioridad (`PRIORITY_ALERTS`). No se guardan: la vista las calcula en cada lectura.
 */
export const DESK_ALERTS = [
  /** "No lo recibí" o un caso abierto por el operador. */
  'INCIDENT',
  /** Entregado con foto: falta que alguien lo mire (o que se cierre solo). */
  'PROOF_REVIEW',
  /** Nadie aceptó la oferta a tiempo, o todos dijeron que no. */
  'NO_TAKERS',
  /** E09: el cliente no respondió y el sistema quitó lo que faltaba. */
  'DECISION_EXPIRED',
  /** Pasó la hora estimada o el local dijo "Sigue en preparación". */
  'PREPARATION_DELAYED',
  'UNASSIGNED',
  /** Entregado sin cobro registrado, o cobrado con otro valor (la caja del día no cuadraría). */
  'COLLECTION_MISSING',
  'COLLECTION_MISMATCH',
] as const;
export type DeskAlert = (typeof DESK_ALERTS)[number];

export const PRIORITY_ALERTS: readonly DeskAlert[] = ['INCIDENT', 'PROOF_REVIEW', 'NO_TAKERS'];

/** Lo que decide el operador al mirar una entrega con foto. */
export const PROOF_OUTCOMES = {
  /** La foto muestra la entrega: → DELIVERED con su comentario. */
  DELIVERED: 'DELIVERED',
  /** Hay que averiguar: abre un caso (lo deja tomado por quien lo abrió) y el pedido pasa a DISPUTED. */
  INVESTIGATE: 'INVESTIGATE',
  /** No se entregó: el caso se abre y se resuelve como cancelado en el mismo paso. */
  CANCELLED: 'CANCELLED',
} as const;
export type ProofOutcome = (typeof PROOF_OUTCOMES)[keyof typeof PROOF_OUTCOMES];

/** Un comentario del operador: obligatorio al resolver o cancelar (queda en la auditoría, RNF-07). */
export const MIN_NOTE_LENGTH = 4;
export const MAX_NOTE_LENGTH = 300;

export const REQUIRED_OPERATIONS_CODES: Record<string, readonly string[]> = {
  incident_types: Object.values(INCIDENT_TYPES),
  incident_statuses: Object.values(INCIDENT_STATUSES),
  incident_resolution_types: Object.values(INCIDENT_RESOLUTIONS),
};
