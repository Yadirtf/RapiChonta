/**
 * E10 · Novedades del pedido (Docs/14-base-de-datos/E10-entrega-e-incidencias.md#incidencias-h103-h105-rf-62).
 * Lo que hace cada tipo y cada resolución es dato del catálogo (incident_types.opens_dispute,
 * incident_resolution_types.resulting_order_status_id); aquí solo se nombran los códigos que el programa usa.
 */
export const INCIDENT_TYPES = {
  /** "No lo recibí" del cliente después de una entrega con foto. Abre disputa. */
  NOT_RECEIVED: 'NOT_RECEIVED',
  WRONG_ORDER: 'WRONG_ORDER',
  DAMAGED: 'DAMAGED',
  /** El caso que abre el operador al revisar una foto que no le convence. Abre disputa. */
  OTHER: 'OTHER',
} as const;
export type IncidentTypeCode = (typeof INCIDENT_TYPES)[keyof typeof INCIDENT_TYPES];

export const INCIDENT_STATUSES = { OPEN: 'OPEN', IN_REVIEW: 'IN_REVIEW', RESOLVED: 'RESOLVED' } as const;
export type IncidentStatusCode = (typeof INCIDENT_STATUSES)[keyof typeof INCIDENT_STATUSES];

export const INCIDENT_RESOLUTIONS = {
  RESOLVED_AS_DELIVERED: 'RESOLVED_AS_DELIVERED',
  RESOLVED_AS_CANCELLED: 'RESOLVED_AS_CANCELLED',
  NO_ORDER_CHANGE: 'NO_ORDER_CHANGE',
} as const;
export type IncidentResolutionCode = (typeof INCIDENT_RESOLUTIONS)[keyof typeof INCIDENT_RESOLUTIONS];

export const INCIDENT_NOTICES = { OPENED: 'INCIDENT_OPENED', RESOLVED: 'INCIDENT_RESOLVED' } as const;

/** El cierre del caso les llega al cliente y al domiciliario (notifications.params.audience): cada app abre lo suyo. */
export const NOTICE_AUDIENCES = { CUSTOMER: 'CUSTOMER', COURIER: 'COURIER' } as const;

/** Lo que cuenta el cliente o el operador al abrirla (incidents.description). */
export const MAX_INCIDENT_DESCRIPTION = 500;

/**
 * Una novedad que tiene al pedido en disputa debe sacarlo de ella: su resolución tiene que dejar el pedido en un
 * estado (entregado o cancelado). "Sin cambio en el pedido" queda para los reclamos que no abren disputa.
 */
export function resolutionFits(opensDispute: boolean, resultingOrderStatus: string | null): boolean {
  return opensDispute ? resultingOrderStatus !== null : resultingOrderStatus === null;
}
