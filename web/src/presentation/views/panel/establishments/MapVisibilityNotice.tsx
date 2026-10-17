"use client";

import { Check, MapPinOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AdminEstablishment } from "@/core/domain/entities/catalog-admin";

/**
 * Un local nuevo nace en borrador y no sale en el mapa del cliente hasta tener un producto disponible y publicarse.
 * Este aviso deja esos dos pasos a la vista; uno dado de baja solo necesita volver a abrirse.
 */
export function MapVisibilityNotice({ establishment, onOpenMenu }: { establishment: AdminEstablishment; onOpenMenu: () => void }) {
  const t = useTranslations("establishmentEditor.visibility");
  const { status, availableCount } = establishment;
  if (status !== "DRAFT" && status !== "INACTIVE") return null;

  const steps =
    status === "DRAFT"
      ? [
          { done: availableCount > 0, label: t("stepMenu"), action: availableCount > 0 ? null : t("goToMenu") },
          { done: false, label: t("stepPublish"), action: null },
        ]
      : [{ done: false, label: t("stepReopen"), action: null }];

  return (
    <section
      aria-labelledby="map-visibility-title"
      className="flex flex-col gap-4 rounded-[28px] border-2 border-dashed border-amber-300 bg-cream p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800" aria-hidden>
        <MapPinOff className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <h2 id="map-visibility-title" className="font-display text-lg font-extrabold tracking-tight">
            {t("title")}
          </h2>
          <p className="text-sm text-ink/60">{t(status === "DRAFT" ? "draftBody" : "inactiveBody")}</p>
        </div>
        <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
          {steps.map((step, i) => (
            <li key={step.label} className="flex items-center gap-2 text-sm font-semibold">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${step.done ? "bg-leaf text-white" : "border-2 border-ink/20 text-ink/60"}`}
                aria-hidden
              >
                {step.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={step.done ? "text-ink/45 line-through" : ""}>{step.label}</span>
              {step.action && (
                <button type="button" onClick={onOpenMenu} className="font-bold text-leaf underline underline-offset-4 hover:text-ink">
                  {step.action}
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
