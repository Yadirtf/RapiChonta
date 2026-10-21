"use client";

import { useTranslations } from "next-intl";
import type { OrderStatusCode } from "@/core/domain/entities/order";
import { statusIcon, statusTone, TONE_CLASSES } from "./orderVisuals";

/** Estado del pedido en lenguaje claro ("Buscando domiciliario", "En camino"). */
export function StatusBadge({ status, className = "" }: { status: OrderStatusCode; className?: string }) {
  const t = useTranslations("orderStatus");
  const Icon = statusIcon(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${TONE_CLASSES[statusTone(status)]} ${className}`}>
      <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
      {t.has(`${status}.label`) ? t(`${status}.label`) : status}
    </span>
  );
}
