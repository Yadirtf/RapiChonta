import type { PersonName } from "./dispatch";

/**
 * E11 · Cajas diarias (Docs/14-base-de-datos/E11). Un libro por domiciliario y día: la base que entrega RapiChonta, lo
 * que paga en el local, lo que le paga el cliente, lo que devuelve al cierre y los ajustes firmados. La API manda los
 * montos como texto decimal con signo ("-18000.00"); aquí se opera en centavos enteros.
 */
export type CashBoxState = "OPEN" | "CLOSED";
export type CashMovementType = "OPENING" | "PURCHASE" | "COLLECTION" | "RETURN" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
export type AdjustmentDirection = "IN" | "OUT";

export interface CashMethod {
  code: string;
  isAccountBased: boolean;
}

export interface CourierBoxRow {
  courier: PersonName & { userId: string; phone: string | null };
  fundingMode: string | null;
  requiresOpening: boolean;
  /** Lleva un pedido ahora mismo: no se cierra hasta que lo termine. */
  busy: boolean;
  /** Solo hoy: si puede recibir ofertas. */
  canReceiveOffers: boolean | null;
  box: {
    id: string;
    state: CashBoxState;
    opening: string | null;
    collected: string;
    settledOrders: number;
    amountDue: string;
    closedAt: string | null;
  } | null;
}

export interface CashBoard {
  municipalityId: number;
  date: string;
  today: string;
  methods: CashMethod[];
  couriers: CourierBoxRow[];
}

export interface CashMovement {
  id: string;
  type: CashMovementType;
  direction: 1 | -1;
  amount: string;
  signed: string;
  paymentMethod: string | null;
  orderCode: string | null;
  note: string | null;
  createdAt: string;
  createdBy: PersonName | null;
  reversesMovementId: string | null;
  reversedById: string | null;
  reversible: boolean;
}

export interface CashBoxDetail {
  id: string;
  businessDate: string;
  courier: PersonName & { userId: string };
  fundingMode: string | null;
  state: CashBoxState;
  closure: {
    closedAt: string;
    closedBy: PersonName;
    notes: string | null;
  } | null;
  totals: {
    type: CashMovementType;
    direction: 1 | -1;
    total: string;
    signed: string;
    count: number;
  }[];
  balance: {
    movementsNet: string;
    courierFees: string;
    commissions: string;
    amountDue: string;
    settledOrders: number;
  };
  movements: CashMovement[];
  orders: {
    code: string;
    storeName: string;
    status: string;
    customerTotal: string;
    collected: string;
    deliveryFee: string;
    commission: string;
    counted: boolean;
  }[];
  uncollected: {
    code: string;
    storeName: string;
    customerTotal: string;
    closedAt: string;
  }[];
}

/** "-18000.50" → -1800050. NaN si no es un monto. */
export function signedCents(decimal: string): number {
  const match = /^(-?)(\d{1,10})(?:\.(\d{1,2}))?$/.exec(decimal.trim());
  if (!match) return NaN;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

/** Las líneas de la cuenta, en el orden en que se cuenta el día; las que no tuvieron movimiento no se muestran. */
export const LEDGER_ORDER: CashMovementType[] = ["OPENING", "PURCHASE", "COLLECTION", "RETURN", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"];

/** Lo que queda al cerrar con lo recibido: positivo falta, negativo sobra, cero cuadra. */
export function closingGap(amountDue: string, received: (number | null)[]): number {
  return signedCents(amountDue) - received.reduce<number>((sum, cents) => sum + (cents ?? 0), 0);
}

export type GapTone = "even" | "short" | "over";
export const gapTone = (cents: number): GapTone => (cents === 0 ? "even" : cents > 0 ? "short" : "over");

/** Cómo está la caja en el tablero: sin abrir (con base pendiente), abierta, cerrada o sin movimiento. */
export type BoxLook = "awaitingBase" | "open" | "closed" | "idle";
export function boxLook(row: CourierBoxRow, isToday: boolean): BoxLook {
  if (row.box?.state === "CLOSED") return "closed";
  if (row.requiresOpening && !row.box?.opening && isToday) return "awaitingBase";
  return row.box ? "open" : "idle";
}

/** Valores rápidos de la base (pesos): lo que suele entregar la oficina. */
export const BASE_PRESETS = [50_000, 100_000, 150_000, 200_000];
