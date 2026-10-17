"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { CART_LIMITS } from "@/core/domain/entities/cart";

/** − cantidad + ; con 1 unidad el botón de restar se vuelve "quitar". */
export function QuantityStepper({ quantity, onChange, name, tone = "light" }: { quantity: number; onChange: (q: number) => void; name: string; tone?: "light" | "brand" }) {
  const t = useTranslations("cart");
  const base = tone === "brand" ? "bg-brand text-ink" : "bg-surface text-ink";
  return (
    <div className={`inline-flex h-10 items-center rounded-full ${base} p-1 shadow-sm`} role="group" aria-label={t("quantityOf", { name })}>
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        aria-label={quantity === 1 ? t("remove", { name }) : t("decrease", { name })}
        className="grid size-8 place-items-center rounded-full transition hover:bg-ink/10 active:scale-90"
      >
        {quantity === 1 ? <Trash2 className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
      </button>
      <span className="min-w-7 text-center font-display text-base font-extrabold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= CART_LIMITS.quantity}
        aria-label={t("increase", { name })}
        className="grid size-8 place-items-center rounded-full transition hover:bg-ink/10 active:scale-90 disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
