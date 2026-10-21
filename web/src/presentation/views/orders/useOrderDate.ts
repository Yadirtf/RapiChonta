"use client";

import { useLocale } from "next-intl";
import { useCallback } from "react";

/** Hora de lanzamiento: Villagarzón. Cuando haya más municipios, llegará con el pedido. */
export const ORDER_TIME_ZONE = "America/Bogota";

/** "21 oct · 3:40 p. m." para hoy y este año; con el año si es de antes. */
export function useOrderDate() {
  const locale = useLocale();
  return useCallback(
    (iso: string) => {
      const tag = locale === "en" ? "en-US" : "es-CO";
      const date = new Date(iso);
      const sameYear = date.getFullYear() === new Date().getFullYear();
      const day = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: sameYear ? undefined : "numeric", timeZone: ORDER_TIME_ZONE }).format(date);
      const time = new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit", timeZone: ORDER_TIME_ZONE }).format(date);
      return `${day} · ${time}`;
    },
    [locale],
  );
}

/** "3:40 p. m." en la hora del municipio. */
export function useOrderTime() {
  const locale = useLocale();
  return useCallback(
    (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { hour: "numeric", minute: "2-digit", timeZone: ORDER_TIME_ZONE }).format(new Date(iso)),
    [locale],
  );
}
