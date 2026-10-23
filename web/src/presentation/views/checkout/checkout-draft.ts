import type { GeoPoint } from "@/core/domain/entities/establishment";
import type { DeliveryChoice, PaymentMethodCode, QuoteDelivery, RecipientChoice, SavedAddress } from "@/core/domain/entities/order";
import { phoneDigits } from "../../components/auth/PhoneInput";

/** Nombres sugeridos para guardar un lugar; "custom" deja escribir otro ("Finca", "Donde la abuela"). */
export const PLACE_LABELS = ["home", "work", "family", "custom"] as const;
export type PlaceLabel = (typeof PLACE_LABELS)[number];

export const MIN_REFERENCE = 3;

/** Lo que el cliente va llenando en la pantalla de pedido. Se traduce a la petición solo al cotizar o confirmar. */
export interface CheckoutDraft {
  /** Lugar guardado elegido, o null si marca otro punto en el mapa. */
  savedAddressId: string | null;
  point: GeoPoint | null;
  reference: string;
  line: string;
  /** null = no guardar el punto. */
  saveAs: PlaceLabel | null;
  customLabel: string;
  recipient: { kind: "me" } | { kind: "saved"; id: string } | { kind: "new"; fullName: string; phone: string };
  payment: PaymentMethodCode | null;
  /** Billete con el que paga en efectivo (centavos), o "exact". */
  cashWith: number | "exact" | null;
  notes: string;
}

/**
 * Arranca marcando el punto: el GPS lo pone donde está el cliente ahora y la dirección del último pedido queda
 * al lado como opción, sin elegirla (pedir desde otro lugar no debe ir a la casa por descuido).
 */
export const emptyDraft = (addresses: SavedAddress[]): CheckoutDraft => ({
  savedAddressId: null,
  point: null,
  reference: "",
  line: "",
  saveAs: addresses.length ? null : "home",
  customLabel: "",
  recipient: { kind: "me" },
  payment: null,
  cashWith: null,
  notes: "",
});

export const quoteDelivery = (draft: CheckoutDraft): QuoteDelivery | null =>
  draft.savedAddressId ? { addressId: draft.savedAddressId } : draft.point ? { latitude: round(draft.point.lat), longitude: round(draft.point.lng) } : null;

/** Siete decimales (~1 cm): el mismo punto no vuelve a cotizarse por ruido del mapa. */
const round = (value: number) => Math.round(value * 1e7) / 1e7;

export type DraftProblem = "reference" | "recipient" | "payment" | "point";

/** Qué falta para confirmar, en el orden de los pasos (la vista lleva al primero). */
export function draftProblems(draft: CheckoutDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!draft.savedAddressId && !draft.point) problems.push("point");
  if (!draft.savedAddressId && draft.reference.trim().length < MIN_REFERENCE) problems.push("reference");
  if (draft.recipient.kind === "new" && (draft.recipient.fullName.trim().length < 2 || !/^3\d{9}$/.test(phoneDigits(draft.recipient.phone)))) problems.push("recipient");
  if (!draft.payment) problems.push("payment");
  return problems;
}

export function deliveryChoice(draft: CheckoutDraft, labelText: (label: PlaceLabel) => string): DeliveryChoice {
  if (draft.savedAddressId) return { addressId: draft.savedAddressId };
  const label = draft.saveAs === "custom" ? draft.customLabel.trim() || null : draft.saveAs ? labelText(draft.saveAs) : null;
  return { latitude: round(draft.point!.lat), longitude: round(draft.point!.lng), reference: draft.reference.trim(), line: draft.line.trim() || null, label };
}

export function recipientChoice(draft: CheckoutDraft): RecipientChoice {
  const r = draft.recipient;
  if (r.kind === "me") return null;
  if (r.kind === "saved") return { recipientId: r.id };
  return { fullName: r.fullName.trim(), phone: `+57${phoneDigits(r.phone)}` };
}

/** La nota que lee el domiciliario: primero con qué billete paga (para llevar el cambio), luego lo que escribió. */
export function courierNotes(draft: CheckoutDraft, cashText: (paysWith: number | "exact") => string): string | null {
  const cash = draft.payment === "CASH" && draft.cashWith !== null ? cashText(draft.cashWith) : null;
  return [cash, draft.notes.trim()].filter(Boolean).join("\n") || null;
}
