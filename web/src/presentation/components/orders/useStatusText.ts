"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { FulfillmentMode, OrderStatusCode } from "@/core/domain/entities/order";

/**
 * Texto de un estado del pedido. En un pedido directo (E15) algunos estados se cuentan distinto (el domiciliario
 * recoge, no compra): primero orderStatus.byMode.<modo>.<estado>, luego orderStatus.<estado>, luego el código.
 */
export function useStatusText(mode?: FulfillmentMode) {
  const t = useTranslations("orderStatus");
  return useCallback(
    (status: OrderStatusCode, part: "label" | "body"): string | null => {
      const byMode = mode ? `byMode.${mode}.${status}.${part}` : null;
      if (byMode && t.has(byMode)) return t(byMode);
      if (t.has(`${status}.${part}`)) return t(`${status}.${part}`);
      return part === "label" ? status : null;
    },
    [mode, t],
  );
}
