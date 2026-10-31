import { Bike, Camera, Flame, HandCoins, Megaphone, Scale, Siren, Store, Timer, type LucideIcon } from "lucide-react";
import type { DeskAlertCode } from "@/core/domain/entities/desk";

/**
 * Cada alerta con su ícono y su tinta: las que piden a alguien ya en chontaduro o tinta (laten), las de la cocina
 * en amarillo y las de la caja en verde hoja.
 */
export const ALERT_LOOK: Record<DeskAlertCode, { icon: LucideIcon; chip: string; ink: string }> = {
  INCIDENT: { icon: Siren, chip: "bg-chonta text-white", ink: "text-chonta" },
  PROOF_REVIEW: { icon: Camera, chip: "bg-ink text-brand", ink: "text-ink" },
  NO_TAKERS: { icon: Megaphone, chip: "bg-chonta-soft text-chonta-strong", ink: "text-chonta-strong" },
  MERCHANT_SILENT: { icon: Store, chip: "bg-chonta-soft text-chonta-strong", ink: "text-chonta-strong" },
  DECISION_EXPIRED: { icon: Timer, chip: "bg-brand text-ink", ink: "text-chonta-strong" },
  PREPARATION_DELAYED: { icon: Flame, chip: "bg-brand text-ink", ink: "text-chonta-strong" },
  UNASSIGNED: { icon: Bike, chip: "bg-white text-ink ring-1 ring-ink/15", ink: "text-ink/70" },
  COLLECTION_MISSING: { icon: HandCoins, chip: "bg-leaf text-white", ink: "text-leaf" },
  COLLECTION_MISMATCH: { icon: Scale, chip: "bg-leaf/15 text-leaf", ink: "text-leaf" },
};
