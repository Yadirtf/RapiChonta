"use client";

import { Check, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { cashSuggestions, type PaymentMethodCode } from "@/core/domain/entities/order";
import { paymentIcon } from "../../components/orders/orderVisuals";
import { FieldShell, inputClass } from "../../components/ui/Field";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import type { CheckoutDraft } from "./checkout-draft";
import { ChoiceChip } from "./StepCard";

/** La API admite 500; se reservan 40 para "Pago con $ 100.000" que va delante. */
const NOTES_MAX = 460;

/**
 * Paso 3 (RF-22): se paga contra entrega. En efectivo el cliente dice con qué billete paga para que el
 * domiciliario lleve el cambio; con Nequi, Daviplata o transferencia se paga al recibir con el QR o el
 * número que le muestra el domiciliario.
 */
export function PaymentStep({ draft, onChange, methods, totalCents, showErrors }: {
  draft: CheckoutDraft;
  onChange: (patch: Partial<CheckoutDraft>) => void;
  methods: PaymentMethodCode[];
  totalCents: number | null;
  showErrors: boolean;
}) {
  const t = useTranslations("checkout");
  const tp = useTranslations("payment");
  const money = useCatalogFormat();
  const name = (m: PaymentMethodCode) => (tp.has(m) ? tp(m) : m);
  const bills = totalCents ? cashSuggestions(totalCents) : [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink/60">{t("payHint")}</p>
      <div role="radiogroup" aria-label={t("stepPay")} className="grid grid-cols-2 gap-2.5">
        {methods.map((method) => {
          const Icon = paymentIcon(method);
          const selected = draft.payment === method;
          return (
            <button
              key={method}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ payment: method, cashWith: method === "CASH" ? draft.cashWith : null })}
              className={`relative flex flex-col items-start gap-3 rounded-3xl border-2 p-4 text-left outline-none transition focus-visible:ring-4 focus-visible:ring-brand/40 active:scale-[0.98] ${
                selected ? "border-ink bg-brand text-ink" : "border-ink/10 bg-white hover:border-ink/25"
              }`}
            >
              <span className={`grid size-10 place-items-center rounded-2xl ${selected ? "bg-ink text-brand" : "bg-cream text-chonta"}`}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="font-display text-base font-extrabold">{name(method)}</span>
              {selected && (
                <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-ink text-brand" aria-hidden>
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {showErrors && !draft.payment && <p className="text-xs font-medium text-red-600">{t("missingPayment")}</p>}

      {draft.payment === "CASH" && (
        <div className="flex flex-col gap-2 rounded-3xl bg-cream p-4">
          <p className="text-sm font-bold">{t("cashChange")}</p>
          <div role="radiogroup" aria-label={t("cashChange")} className="flex flex-wrap gap-2">
            <ChoiceChip selected={draft.cashWith === "exact"} onClick={() => onChange({ cashWith: "exact" })} className="!py-2">
              {t("cashExact")}
            </ChoiceChip>
            {bills.map((cents) => (
              <ChoiceChip key={cents} selected={draft.cashWith === cents} onClick={() => onChange({ cashWith: cents })} className="!py-2 tabular-nums">
                {money.cents(cents)}
              </ChoiceChip>
            ))}
          </div>
        </div>
      )}
      {draft.payment && draft.payment !== "CASH" && (
        <p className="flex items-start gap-2 rounded-2xl bg-cream px-3.5 py-3 text-sm text-ink/70">
          <Info className="mt-0.5 size-4 shrink-0 text-chonta" aria-hidden />
          {draft.payment === "BANK_TRANSFER" ? t("transferHint") : t("walletHint", { method: name(draft.payment) })}
        </p>
      )}

      <FieldShell label={t("notes")} hint={`${draft.notes.length}/${NOTES_MAX}`}>
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            rows={2}
            maxLength={NOTES_MAX}
            value={draft.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder={t("notesPlaceholder")}
            className={`${inputClass} h-auto resize-none py-3`}
          />
        )}
      </FieldShell>
    </div>
  );
}
