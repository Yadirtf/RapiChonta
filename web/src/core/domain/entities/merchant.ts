import type { MenuLimits } from "./catalog-admin";
import type { OrderStatusCode } from "./order";

/** E15: el comercio aliado. Los códigos los da la API; la vista los traduce. */

/** Columnas del mostrador, en el orden en que avanza un pedido (la API decide en cuál va cada uno). */
export type CounterLane = "INCOMING" | "PREPARING" | "READY" | "CLOSED";

export const MERCHANT_POLL_MS = 5_000;

export interface MerchantStore {
  id: string;
  name: string;
  /** ACTIVE = abierto; TEMPORARILY_CLOSED = en pausa. Lo demás (borrador, de baja) es del panel. */
  status: string;
  acceptsOrders: boolean;
  logoUrl: string | null;
  municipality: { id: number; name: string; timeZone: string };
  partnership: { startedOn: string; endedOn: string | null };
  waiting: number;
  preparing: number;
}

export interface CounterLine {
  name: string;
  quantity: number;
  notes: string | null;
  prepMinutes: number;
}

export interface CounterOrder {
  id: string;
  code: string;
  status: OrderStatusCode;
  terminal: boolean;
  lane: CounterLane;
  createdAt: string;
  closedAt: string | null;
  acceptedAt: string | null;
  preparationMinutes: number | null;
  estimatedReadyAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  customerName: string;
  customerNotes: string | null;
  lines: CounterLine[];
  itemsTotal: string;
  courier: { givenNames: string; phone: string | null } | null;
  cancellation: { reason: string; byMerchant: boolean } | null;
  /** Lo que tarda el producto más lento: el tiempo que el portal propone al aceptar. */
  suggestedMinutes: number;
}

export interface MerchantOptions {
  declineReasons: string[];
  preparationMinutes: { min: number; max: number };
  closedWindowHours: number;
  menuLimits: MenuLimits;
}

/** Tiempos rápidos al aceptar: lo que más se repite en una cocina de barrio. */
export const QUICK_MINUTES = [10, 15, 20, 30, 45] as const;

/** Segundos que lleva un pedido esperando respuesta: a los 3 min el panel de RapiChonta ya lo ve como alerta. */
export const RESPONSE_WARN_SECONDS = 120;

export interface Partnership {
  id: string;
  startedOn: string;
  endedOn: string | null;
  agreementUrl: string | null;
  createdAt: string;
  createdBy: string;
}

export interface StoreMember {
  staffId: string;
  userId: string;
  givenNames: string;
  familyNames: string | null;
  phone: string | null;
  grantedAt: string;
  lastSignInAt: string | null;
}

export interface PartnershipView {
  establishment: {
    id: string;
    name: string;
    municipalityId: number;
    today: string;
  };
  current: Partnership | null;
  upcoming: Partnership | null;
  past: Partnership[];
  members: StoreMember[];
}

export interface StoreMemberInput {
  phone: string;
  givenNames?: string;
  familyNames?: string;
  documentType?: string;
  documentNumber?: string;
  password?: string;
}
