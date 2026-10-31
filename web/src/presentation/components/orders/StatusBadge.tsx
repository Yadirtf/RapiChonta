"use client";

import { createElement } from "react";
import type { FulfillmentMode, OrderStatusCode } from "@/core/domain/entities/order";
import { statusIcon, statusTone, TONE_CLASSES } from "./orderVisuals";
import { useStatusText } from "./useStatusText";

/** Estado del pedido en lenguaje claro ("Buscando domiciliario", "En camino"). */
export function StatusBadge({ status, mode, className = "" }: { status: OrderStatusCode; mode?: FulfillmentMode; className?: string }) {
  const text = useStatusText(mode);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${TONE_CLASSES[statusTone(status)]} ${className}`}>
      {createElement(statusIcon(status), { className: "size-3.5", strokeWidth: 2.5, "aria-hidden": true })}
      {text(status, "label")}
    </span>
  );
}
