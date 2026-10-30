"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";
import { signedCents } from "@/core/domain/entities/cash";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";

/** Pesos con signo para el libro ("+ $ 18.000", "− $ 3.000") y la fecha del día de caja. */
export function useCashFormat() {
  const money = useCatalogFormat();
  const locale = useLocale();
  return useMemo(() => {
    const tag = locale === "en" ? "en-US" : "es-CO";
    const amount = (decimal: string) => money.cents(Math.abs(signedCents(decimal)));
    return {
      amount,
      cents: (cents: number) => money.cents(Math.abs(cents)),
      signed: (decimal: string) => {
        const cents = signedCents(decimal);
        return `${cents < 0 ? "−" : cents > 0 ? "+" : ""} ${money.cents(Math.abs(cents))}`.trim();
      },
      day: (iso: string) => {
        const text = new Intl.DateTimeFormat(tag, {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        }).format(new Date(`${iso}T12:00:00Z`));
        return text.charAt(0).toUpperCase() + text.slice(1);
      },
      shortDay: (iso: string) =>
        new Intl.DateTimeFormat(tag, {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${iso}T12:00:00Z`)),
    };
  }, [money, locale]);
}

/** El día anterior a una fecha YYYY-MM-DD. */
export const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
