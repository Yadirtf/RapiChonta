"use client";

import { useTranslations } from "next-intl";
import { DISPLAY_CURRENCIES } from "@/core/domain/entities/business";
import { useBusiness } from "../../business/BusinessProvider";

/** COP solo, o pesos con el aproximado en USD o EUR (H03.4). */
export function CurrencyPicker({ className = "" }: { className?: string }) {
  const t = useTranslations("business");
  const { displayCurrency, setDisplayCurrency } = useBusiness();
  const options = [null, ...DISPLAY_CURRENCIES] as const;
  return (
    <div role="group" aria-label={t("currency")} title={t("currencyHint")} className={`flex flex-col gap-1 md:flex-row ${className}`}>
      {options.map((code) => (
        <button
          key={code ?? "COP"}
          onClick={() => setDisplayCurrency(code)}
          aria-pressed={displayCurrency === code}
          className={`whitespace-nowrap rounded-lg px-1.5 py-1 text-xs font-bold md:px-2 ${displayCurrency === code ? "bg-white text-ink" : "text-white/75 hover:bg-white/10"}`}
        >
          {code ? `≈ ${code}` : "COP"}
        </button>
      ))}
    </div>
  );
}
