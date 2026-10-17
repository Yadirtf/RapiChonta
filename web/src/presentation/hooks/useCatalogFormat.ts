"use client";

import { useFormatter, useLocale } from "next-intl";
import { useMemo } from "react";
import { toCents } from "@/core/domain/entities/money";

/** Precios en pesos, distancias y minutos con el formato del idioma activo. */
export function useCatalogFormat() {
  const format = useFormatter();
  const locale = useLocale();
  return useMemo(() => {
    // "$ 6.000" y no "6000 COP" ni "6.000 $": convenciones de Colombia (es-CO / en-CO) en ambos idiomas.
    const peso = (digits: number) =>
      new Intl.NumberFormat(`${locale}-CO`, { style: "currency", currency: "COP", currencyDisplay: "narrowSymbol", useGrouping: "always", minimumFractionDigits: digits, maximumFractionDigits: digits });
    const whole = peso(0);
    const withCents = peso(2);
    const cents = (value: number) => (value % 100 === 0 ? whole : withCents).format(value / 100);
    return {
      cents,
      price: (decimal: string) => cents(toCents(decimal)),
      distance: (meters: number) =>
        meters < 1000
          ? format.number(Math.round(meters / 10) * 10, { style: "unit", unit: "meter", maximumFractionDigits: 0 })
          : format.number(meters / 1000, { style: "unit", unit: "kilometer", maximumFractionDigits: 1 }),
      squareMeters: (value: number) => `${format.number(Math.round(value), { maximumFractionDigits: 0 })} m²`,
    };
  }, [format, locale]);
}
