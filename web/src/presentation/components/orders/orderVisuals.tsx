import {
  Banknote,
  Bike,
  Camera,
  CircleHelp,
  CookingPot,
  MapPinCheck,
  MessageCircleQuestion,
  PackageCheck,
  QrCode,
  Search,
  ShieldAlert,
  Smartphone,
  Store,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { OrderStatusCode, PaymentMethodCode } from "@/core/domain/entities/order";

/**
 * Ícono de cada estado del pedido. Los estados vienen del catálogo de la API: uno nuevo sin ícono propio
 * se ve con el genérico, y su texto con la clave orderStatus.<code> (o el código si aún no se tradujo).
 */
const STATUS_ICONS: Record<string, LucideIcon> = {
  PENDING_ASSIGNMENT: Search,
  ACCEPTED: UserCheck,
  AT_ESTABLISHMENT: Store,
  AWAITING_CUSTOMER: MessageCircleQuestion,
  PREPARING: CookingPot,
  ON_THE_WAY: Bike,
  ARRIVING: MapPinCheck,
  PENDING_REVIEW: Camera,
  DISPUTED: ShieldAlert,
  DELIVERED: PackageCheck,
  CANCELLED: XCircle,
};

export const statusIcon = (status: OrderStatusCode): LucideIcon => STATUS_ICONS[status] ?? CircleHelp;

/** Tono del estado: necesita al cliente (chonta), terminó bien (hoja), se canceló (gris) o va en curso (marca). */
export function statusTone(status: OrderStatusCode): "attention" | "done" | "off" | "progress" {
  if (status === "AWAITING_CUSTOMER" || status === "DISPUTED" || status === "ARRIVING") return "attention";
  if (status === "DELIVERED") return "done";
  if (status === "CANCELLED") return "off";
  return "progress";
}

export const TONE_CLASSES = {
  attention: "bg-chonta text-white",
  done: "bg-leaf text-white",
  off: "bg-ink/10 text-ink/60",
  progress: "bg-brand text-ink",
} as const;

const PAYMENT_ICONS: Record<string, LucideIcon> = { CASH: Banknote, NEQUI: Smartphone, DAVIPLATA: Smartphone, BANK_TRANSFER: QrCode };

export const paymentIcon = (method: PaymentMethodCode): LucideIcon => PAYMENT_ICONS[method] ?? Banknote;
