import { ArrowDownLeft, ArrowUpRight, HandCoins, Landmark, ShoppingBag, Undo2, Wallet, type LucideIcon } from "lucide-react";
import type { BoxLook, CashMovementType, GapTone } from "@/core/domain/entities/cash";

/** Cada línea del libro con su ícono: la base sale de la oficina, la compra va al local, el cobro llega del cliente… */
export const MOVEMENT_ICON: Record<CashMovementType, LucideIcon> = {
  OPENING: Wallet,
  PURCHASE: ShoppingBag,
  COLLECTION: HandCoins,
  RETURN: Landmark,
  ADJUSTMENT_IN: ArrowUpRight,
  ADJUSTMENT_OUT: ArrowDownLeft,
};
export const REVERSAL_ICON = Undo2;

/** El sello del sobre en el tablero. */
export const LOOK_SEAL: Record<BoxLook, string> = {
  awaitingBase: "bg-chonta text-white",
  open: "bg-leaf text-white",
  closed: "bg-ink text-brand",
  idle: "bg-white text-ink/55 ring-1 ring-ink/10",
};

/** El sello del arqueo: cuadra en verde hoja, falta en chontaduro, sobra en amarillo de marca. */
export const GAP_STAMP: Record<GapTone, string> = {
  even: "border-leaf text-leaf",
  short: "border-chonta-strong text-chonta-strong",
  over: "border-ink text-ink bg-brand/40",
};
