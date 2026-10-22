import type { OrderPreparation, OrderPurchase, OrderStatusCode, PaymentMethodCode } from "./order";

/** E07: la central de despacho del operador. Los códigos los da la API; la vista los traduce. */
export type OfferMode = "SPECIFIC" | "BROADCAST";
export type RecipientStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "WITHDRAWN" | (string & {});
/** Por qué volvió al panel: nadie respondió a tiempo, o todos dijeron "No puedo". */
export type ReturnSource = "TIMER" | "OFFERS_DECLINED" | (string & {});

export interface PersonName {
  givenNames: string;
  familyNames: string | null;
}

export interface DispatchOffer {
  id: string;
  mode: OfferMode;
  sentAt: string;
  expiresAt: string;
  sentBy: PersonName | null;
  recipients: (PersonName & { courierUserId: string; status: RecipientStatus; respondedAt: string | null })[];
}

export interface DispatchOrder {
  code: string;
  createdAt: string;
  status: OrderStatusCode | "OFFERED";
  statusSince: string;
  needsCourier: boolean;
  waitingSince: string | null;
  returnedBy: ReturnSource | null;
  establishment: { id: string; name: string; addressLine: string; latitude: number; longitude: number };
  delivery: { latitude: number; longitude: number; reference: string | null; zoneName: string; zoneKind: string };
  itemCount: number;
  itemsTotal: string;
  deliveryFee: string;
  total: string;
  paymentMethod: PaymentMethodCode;
  offers: DispatchOffer[];
  courier: (PersonName & { userId: string; assignedAt: string }) | null;
  /** E08: la compra con su factura y la preparación (con la alerta de retraso que reporta el domiciliario). */
  purchase: OrderPurchase | null;
  preparation: OrderPreparation | null;
}

export interface DispatchBoardSnapshot {
  municipalityId: number;
  serverTime: string;
  orders: DispatchOrder[];
}

/** Domiciliario en turno (Disponible y sin pedido). Sin `locationFresh` no se le puede ofrecer. */
export interface DispatchCourier extends PersonName {
  userId: string;
  phone: string | null;
  vehicle: { type: string; plate: string | null } | null;
  /** La última lectura recibida; nulas si nunca reportó. */
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  lastSeenAt: string | null;
  /** Reportó ubicación en los últimos `freshSeconds`: se ve en el mapa y se le puede ofrecer. */
  locationFresh: boolean;
  availableSince: string;
  /** Al local del pedido elegido (solo con ubicación reciente). */
  distanceMeters: number | null;
  hasPendingOffer: boolean;
  declined: boolean;
}

/** Con ubicación reciente: está en el mapa y se le puede ofrecer. */
export type LocatedCourier = DispatchCourier & { latitude: number; longitude: number; lastSeenAt: string };

export function isLocated(courier: DispatchCourier): courier is LocatedCourier {
  return courier.locationFresh && courier.latitude !== null && courier.longitude !== null && courier.lastSeenAt !== null;
}

export interface StaffActivityEntry {
  id: string;
  occurredAt: string;
  actor: (PersonName & { userId: string; role: string | null }) | null;
  action: string;
  entityTable: string;
  entityId: string;
  orderCode: string | null;
  details: Record<string, unknown> | null;
}

export interface StaffActivityPage {
  entries: StaffActivityEntry[];
  nextCursor: string | null;
}

export interface StaffActivityFilters {
  from?: string;
  to?: string;
  actorUserId?: string;
  order?: string;
}

/** Cada cuánto consulta el panel (H07.1: "cada pocos segundos"; el tiempo real llega en la Fase 3). */
export const DISPATCH_POLL_MS = 5_000;

/** Un pedido llama la atención mientras busca domiciliario y nadie lo tiene en pantalla. */
export const needsAttention = (order: DispatchOrder) => order.needsCourier && order.offers.length === 0;

/**
 * Clave de la alerta: la misma mientras el pedido siga en la misma espera. Suena una vez al llegar y otra si
 * vuelve al panel (otra hora de cambio de estado), nunca en cada consulta.
 */
export const alertKey = (order: DispatchOrder) => `${order.code}@${order.statusSince}`;

/** Qué tan urgente se ve la espera: verde al llegar, amarillo a los 3 min, chontaduro a los 8. */
export function waitTone(seconds: number): "fresh" | "warm" | "late" {
  if (seconds >= 8 * 60) return "late";
  if (seconds >= 3 * 60) return "warm";
  return "fresh";
}

/** La oferta viva que vence primero (la que se muestra en la cuenta regresiva). */
export const soonestOffer = (order: DispatchOrder): DispatchOffer | null =>
  order.offers.reduce<DispatchOffer | null>((soonest, offer) => (!soonest || offer.expiresAt < soonest.expiresAt ? offer : soonest), null);

/** "1:05" para la espera; "1 h 05" pasada la hora. */
export function elapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m}:${rest}`;
}
