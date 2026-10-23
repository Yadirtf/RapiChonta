import type { PersonName } from "./dispatch";
import { toCents } from "./money";
import type { IncidentResolution, IncidentStatus, OrderStatusCode, PaymentMethodCode } from "./order";

/**
 * H10.5: el panel de pedidos en curso del operador. Las alertas no se guardan: la API las calcula en cada consulta
 * (v_active_order_alerts) y aquí solo se ordenan, se agrupan y se traducen.
 */
export const DESK_ALERTS = [
  "INCIDENT",
  "PROOF_REVIEW",
  "NO_TAKERS",
  "DECISION_EXPIRED",
  "PREPARATION_DELAYED",
  "UNASSIGNED",
  "COLLECTION_MISSING",
  "COLLECTION_MISMATCH",
] as const;
export type DeskAlertCode = (typeof DESK_ALERTS)[number];

/** Las que suenan y laten: alguien tiene que mirarlas ya. */
export const PRIORITY_ALERTS: readonly DeskAlertCode[] = ["INCIDENT", "PROOF_REVIEW", "NO_TAKERS"];

export type IncidentType = "NOT_RECEIVED" | "WRONG_ORDER" | "DAMAGED" | "OTHER" | (string & {});
export type ProofOutcome = "DELIVERED" | "INVESTIGATE" | "CANCELLED";

export interface DeskAlert {
  code: DeskAlertCode;
  since: string;
}

export interface DeskIncident {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  description: string | null;
  createdAt: string;
  reportedByRole: "CUSTOMER" | "STAFF" | (string & {});
  takenBy: PersonName | null;
}

export interface DeskOrder {
  code: string;
  status: OrderStatusCode;
  statusSince: string;
  createdAt: string;
  establishment: { name: string };
  zoneName: string;
  customer: PersonName & { phone: string | null };
  courier: (PersonName & { userId: string; phone: string | null; holding: boolean }) | null;
  total: string;
  paymentMethod: PaymentMethodCode;
  alerts: DeskAlert[];
  incident: DeskIncident | null;
  cancellable: boolean;
}

export interface DeskBoardSnapshot {
  municipalityId: number;
  serverTime: string;
  orders: DeskOrder[];
}

type Actor = PersonName & { role: string };

export type DeskEvent =
  | { kind: "STATUS"; at: string; from: OrderStatusCode | null; to: OrderStatusCode; actor: Actor | null; source: string; note: string | null }
  | { kind: "OFFER"; at: string; mode: "SPECIFIC" | "BROADCAST" | (string & {}); sentBy: PersonName | null; recipients: (PersonName & { status: string; respondedAt: string | null })[] }
  | { kind: "RELEASE"; at: string; courier: PersonName; reason: string; by: PersonName | null }
  | { kind: "DELAY"; at: string }
  | { kind: "ADJUSTMENT"; at: string; expiresAt: string; lines: { name: string; reason: string; decision: string | null; decidedAt: string | null }[] }
  | { kind: "CODE_ATTEMPT"; at: string }
  | { kind: "COLLECTION"; at: string; paymentMethod: PaymentMethodCode; amount: string }
  | { kind: "INCIDENT"; at: string; incidentId: string; status: IncidentStatus; type: IncidentType; by: Actor; resolution: IncidentResolution | null; note: string | null };

export interface DeskOrderDetail extends DeskOrder {
  lines: { name: string; quantity: number; unitPrice: string; removed: boolean }[];
  amounts: { items: string; deliveryFee: string; total: string };
  delivery: { label: string | null; line: string | null; reference: string | null; latitude: number; longitude: number };
  notes: string | null;
  purchase: { amount: string; receiptUrl: string | null } | null;
  proof: { url: string | null; capturedAt: string | null; distanceMeters: number | null } | null;
  collection: { total: string; payments: { paymentMethod: PaymentMethodCode; amount: string; at: string }[] } | null;
  cancellation: { reason: string; notes: string | null } | null;
  timeline: DeskEvent[];
}

/** Cada cuánto consulta el panel (igual que el despacho). */
export const DESK_POLL_MS = 5_000;
/** El comentario del personal: lo exige la API y queda en la auditoría. */
export const MIN_NOTE_LENGTH = 4;
export const MAX_NOTE_LENGTH = 300;

/**
 * Los carriles del pase, en el orden en que avanza un pedido. Los cerrados ("closed") no son un carril: se ven
 * aparte, abajo, mientras deben algo (el cobro sin registrar o que no cuadra).
 */
export const DESK_LANES = ["dispatch", "store", "road", "review"] as const;
export type DeskLane = (typeof DESK_LANES)[number] | "closed";

const LANE_OF: Record<string, DeskLane> = {
  PENDING_ASSIGNMENT: "dispatch",
  OFFERED: "dispatch",
  ACCEPTED: "store",
  AT_ESTABLISHMENT: "store",
  AWAITING_CUSTOMER: "store",
  PREPARING: "store",
  ON_THE_WAY: "road",
  ARRIVING: "road",
  PENDING_REVIEW: "review",
  DISPUTED: "review",
  DELIVERED: "closed",
  CANCELLED: "closed",
};

export const laneOf = (order: DeskOrder): DeskLane => LANE_OF[order.status] ?? "store";

export const isPriority = (order: DeskOrder) => order.alerts.some((a) => PRIORITY_ALERTS.includes(a.code));

/** Una vez por alerta: la misma mientras siga la misma (otra hora = otra alerta). */
export const alertKeys = (order: DeskOrder) => order.alerts.filter((a) => PRIORITY_ALERTS.includes(a.code)).map((a) => `${order.code}:${a.code}@${a.since}`);

/** Qué tan cerca del punto de entrega se tomó la foto: en la puerta, en la cuadra o lejos. */
export function proofDistanceTone(meters: number | null): "near" | "block" | "far" | "unknown" {
  if (meters === null) return "unknown";
  if (meters <= 60) return "near";
  if (meters <= 200) return "block";
  return "far";
}

/** Un caso que pone el pedido en disputa se resuelve dejándolo entregado o cancelado; los demás, sin cambiarlo. */
export const DISPUTE_RESOLUTIONS: IncidentResolution[] = ["RESOLVED_AS_DELIVERED", "RESOLVED_AS_CANCELLED"];

/** Lo que el cobro tiene de diferencia con el total (en centavos para no perder pesos). */
export function collectionGap(order: Pick<DeskOrderDetail, "collection" | "amounts">): number | null {
  return order.collection ? toCents(order.collection.total) - toCents(order.amounts.total) : null;
}
