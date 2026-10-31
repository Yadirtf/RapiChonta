"use client";

import { Handshake, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FulfillmentMode } from "@/core/domain/entities/order";

const LOOK: Record<string, { icon: typeof Handshake; seal: string }> = {
  MERCHANT_DIRECT: { icon: Handshake, seal: "bg-leaf text-white" },
  COURIER_PURCHASE: { icon: ShoppingBag, seal: "bg-chonta text-white" },
};

/**
 * H15.2: en un comercio aliado el cliente elige cómo le llega el pedido. Dos comandas lado a lado: directo del local
 * (lo prepara el comercio y lo recoge el domiciliario) o la compra de siempre por RapiChonta. Mismo precio y domicilio.
 */
export function ModeStep({ modes, value, store, onChange }: { modes: FulfillmentMode[]; value: FulfillmentMode; store: string; onChange: (mode: FulfillmentMode) => void }) {
  const t = useTranslations("checkout.mode");
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("label")}>
        {modes.map((mode) => {
          const look = LOOK[mode] ?? LOOK.COURIER_PURCHASE;
          const Icon = look.icon;
          const selected = value === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(mode)}
              className={`relative flex flex-col gap-2 rounded-2xl border-2 p-4 text-left outline-none transition focus-visible:ring-4 focus-visible:ring-brand/40 active:scale-[0.99] ${
                selected ? "border-ink bg-brand/20" : "border-ink/10 bg-white hover:border-ink/25"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`grid size-10 shrink-0 -rotate-6 place-items-center rounded-xl ${look.seal}`}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="font-display text-base font-extrabold leading-tight">{t(`${mode}.title`, { store })}</span>
              </span>
              <span className="text-sm text-ink/65">{t(`${mode}.body`, { store })}</span>
              {mode === "MERCHANT_DIRECT" && <span className="stamp absolute -top-2.5 right-3 bg-cream text-leaf">{t("partner")}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink/50">{t("samePrice")}</p>
    </div>
  );
}
