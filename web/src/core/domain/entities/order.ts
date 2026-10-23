import type { GeoPoint } from "./establishment";
import { toCents } from "./money";

/** Medios de pago contra entrega (RF-22). El código lo traduce la vista; el catálogo lo da la API. */
export type PaymentMethodCode = "CASH" | "NEQUI" | "DAVIPLATA" | "BANK_TRANSFER" | (string & {});

/** Estados que puede ver el cliente. La lista y su orden vienen de la API (`journey`); aquí solo se nombran. */
export type OrderStatusCode =
  | "PENDING_ASSIGNMENT"
  | "ACCEPTED"
  | "AT_ESTABLISHMENT"
  | "AWAITING_CUSTOMER"
  | "PREPARING"
  | "ON_THE_WAY"
  | "ARRIVING"
  | "PENDING_REVIEW"
  | "DISPUTED"
  | "DELIVERED"
  | "CANCELLED"
  | (string & {});

export interface SavedAddress {
  id: string;
  label: string | null;
  line: string | null;
  reference: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
}

export interface SavedRecipient {
  id: string;
  fullName: string;
  phone: string;
}

/** Dónde se entrega: una dirección guardada o un punto con referencia (y nombre si se quiere guardar). */
export type DeliveryChoice =
  | { addressId: string }
  | { latitude: number; longitude: number; reference: string; line?: string | null; label?: string | null };

/** Para cotizar basta el punto: la referencia se pide recién al confirmar. */
export type QuoteDelivery = { addressId: string } | { latitude: number; longitude: number };

export type RecipientChoice = { recipientId: string } | { fullName: string; phone: string } | null;

export interface CheckoutItem {
  productVersionId: string;
  quantity: number;
  notes?: string | null;
}

export interface OrderQuote {
  establishment: { id: string; name: string };
  lines: { productId: string; productVersionId: string; name: string; unitPrice: string; quantity: number; subtotal: string }[];
  itemsTotal: string;
  deliveryFee: string;
  total: string;
  prepMinutes: number;
  zone: { name: string; kind: "URBAN" | "RURAL" | (string & {}) };
  /** Solo para clientes sin pedidos entregados (tope de RF-22). */
  newCustomerLimit: { limit: string; available: string; exceeded: boolean } | null;
}

export interface OrderSummary {
  code: string;
  establishment: { id: string; name: string; logoUrl: string | null };
  createdAt: string;
  status: OrderStatusCode;
  statusAt: string;
  active: boolean;
  itemCount: number;
  total: string;
}

export interface OrderDetail extends OrderSummary {
  lines: { productId: string; name: string; unitPrice: string; quantity: number; notes: string | null; subtotal: string }[];
  itemsTotal: string;
  deliveryFee: string;
  prepMinutes: number;
  zone: { name: string; kind: string };
  address: { label: string | null; line: string | null; reference: string | null; latitude: number; longitude: number };
  recipient: { fullName: string; phone: string | null } | null;
  paymentMethod: PaymentMethodCode;
  notes: string | null;
  timeline: { status: OrderStatusCode; at: string }[];
  /** Pasos del recorrido normal, en orden (los define la API). */
  journey: OrderStatusCode[];
  /** Mientras se prepara (E08): la hora estimada y si el domiciliario avisó retraso (alta demanda). */
  preparation: OrderPreparation | null;
  /** Lo que pagó el domiciliario en el local, con la factura (URL firmada, vence sola). */
  purchase: OrderPurchase | null;
  /** Cierre de la entrega (E10): el código mientras va en camino, y la foto si el domiciliario lo dejó sin código. */
  delivery: OrderDelivery;
  /** E09: las preguntas del domiciliario (la abierta es la que el cliente responde), de la más reciente a la más vieja. */
  adjustments: OrderAdjustment[];
}

/** Por qué pregunta el domiciliario: no lo hay, o el local pide otro precio. */
export type AdjustmentReason = "UNAVAILABLE" | "PRICE_CHANGED" | (string & {});
/** Las opciones cerradas (EXPIRED_REMOVED la toma el sistema cuando se acaba el tiempo). */
export type AdjustmentDecision = "SUBSTITUTE" | "REMOVE_ITEM" | "ACCEPT_PRICE" | "CANCEL_ORDER" | "EXPIRED_REMOVED" | (string & {});

export interface OrderAdjustmentLine {
  id: string;
  orderItemId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  reason: AdjustmentReason;
  reportedUnitPrice: string | null;
  decision: AdjustmentDecision | null;
  decidedAt: string | null;
  substitute: { name: string; quantity: number; unitPrice: string } | null;
  /** Lo que puede elegir el cliente, en orden (vacío si ya decidió). */
  options: AdjustmentDecision[];
}

export interface OrderAdjustment {
  id: string;
  reportedAt: string;
  expiresAt: string;
  open: boolean;
  lines: OrderAdjustmentLine[];
}

/** Un producto del mismo local para "Cambiar por". */
export interface SubstituteOption {
  productId: string;
  productVersionId: string;
  name: string;
  price: string;
  imageUrl: string | null;
  /** De la misma sección del menú que el que falta. */
  sameSection: boolean;
}

/**
 * Cuánto cambia el total de productos con una decisión, en centavos (negativo: baja). Cambiar por otro se calcula
 * con el producto elegido; cancelar no tiene diferencia (el pedido no sigue).
 */
export function decisionDeltaCents(line: OrderAdjustmentLine, decision: AdjustmentDecision, substitutePrice?: string): number | null {
  const current = toCents(line.unitPrice) * line.quantity;
  switch (decision) {
    case "REMOVE_ITEM":
    case "EXPIRED_REMOVED":
      return -current;
    case "ACCEPT_PRICE":
      return line.reportedUnitPrice ? toCents(line.reportedUnitPrice) * line.quantity - current : null;
    case "SUBSTITUTE":
      return substitutePrice ? toCents(substitutePrice) * line.quantity - current : null;
    default:
      return null;
  }
}

/** La pregunta abierta del domiciliario, si hay una. */
export const openAdjustment = (order: Pick<OrderDetail, "adjustments">) => order.adjustments.find((a) => a.open) ?? null;

export interface OrderDelivery {
  /** Solo en camino o llegando: el cliente se lo dicta al domiciliario y con eso queda entregado. */
  code: string | null;
  /** Foto de la entrega sin código (URL firmada, vence sola). */
  proofUrl: string | null;
  /** Si el cliente no responde, a esta hora se da por entregado. */
  reviewClosesAt: string | null;
}

export interface OrderPreparation {
  estimatedReadyAt: string;
  delayed: boolean;
}

export interface OrderPurchase {
  amount: string;
  receiptUrl: string | null;
}

export interface MyOrdersPage {
  active: OrderSummary[];
  past: OrderSummary[];
  nextBefore: string | null;
  /** Hitos del recorrido normal, para la barra de avance de los activos. */
  journey: OrderStatusCode[];
}

export type RouteStop =
  | { status: OrderStatusCode; state: "done" | "current"; at: string }
  | { status: OrderStatusCode; state: "upcoming"; at: null };

/**
 * La ruta del pedido para la línea de tiempo (RF-50): los pasos por los que pasó (con su hora) y, si sigue
 * activo, los que faltan del recorrido normal. Un desvío (esperando tu decisión, en revisión) aparece donde
 * ocurrió; un pedido cancelado no muestra pasos pendientes.
 */
export function orderRoute(order: Pick<OrderDetail, "timeline" | "journey" | "active">): RouteStop[] {
  const stops: RouteStop[] = order.timeline.map((t, i) => ({
    status: t.status,
    state: i === order.timeline.length - 1 && order.active ? "current" : "done",
    at: t.at,
  }));
  if (!order.active) return stops;
  const reached = Math.max(-1, ...order.timeline.map((t) => order.journey.indexOf(t.status)));
  return [...stops, ...order.journey.slice(reached + 1).map((status) => ({ status, state: "upcoming" as const, at: null }))];
}

/** Avance del recorrido normal (0 a 1) para la barra de las tarjetas de pedidos activos. */
export function journeyProgress(status: OrderStatusCode, journey: OrderStatusCode[]): number {
  const index = journey.indexOf(status);
  return index < 0 || journey.length < 2 ? 0 : index / (journey.length - 1);
}

export const addressPoint = (a: { latitude: number; longitude: number }): GeoPoint => ({ lat: a.latitude, lng: a.longitude });

/**
 * Billetes con los que el cliente podría pagar en efectivo un total: el siguiente múltiplo de $10.000,
 * $20.000, $50.000 y $100.000 por encima del total, sin repetir. Así el domiciliario lleva el cambio.
 */
export function cashSuggestions(totalCents: number): number[] {
  const steps = [10_000_00, 20_000_00, 50_000_00, 100_000_00];
  const amounts = steps.map((step) => Math.ceil(totalCents / step) * step).filter((amount) => amount > totalCents);
  return [...new Set(amounts)].sort((a, b) => a - b).slice(0, 3);
}
