"use client";

import { Check, FileSearch, PackageCheck, PackageX, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OrderDetail, OrderIncident } from "@/core/domain/entities/order";

type Step = { key: "reported" | "review" | "resolved"; at: string | null };

/**
 * H10.3: el caso de "No lo recibí" como un expediente de RapiChonta: la carpeta con el código en la pestaña y
 * tres sellos (lo recibimos, alguien lo está mirando, cerrado). El cliente no ve las notas internas, solo en qué va
 * y cómo terminó.
 */
export function IncidentCase({ order, incident, time }: { order: OrderDetail; incident: OrderIncident; time: (iso: string) => string }) {
  const t = useTranslations("orders.case");
  const resolved = incident.status === "RESOLVED";
  const steps: Step[] = [
    { key: "reported", at: incident.reportedAt },
    { key: "review", at: incident.reviewStartedAt },
    { key: "resolved", at: incident.resolvedAt },
  ];
  const current = resolved ? 2 : incident.reviewStartedAt ? 1 : 0;
  const outcome = incident.resolution === "RESOLVED_AS_DELIVERED" ? "delivered" : incident.resolution === "RESOLVED_AS_CANCELLED" ? "cancelled" : "closed";
  const OutcomeIcon = outcome === "cancelled" ? PackageX : PackageCheck;

  return (
    <section className="case-file p-5 sm:p-6" data-tab={t("tab", { code: order.code })} aria-labelledby="case-title" role={resolved ? undefined : "status"}>
      <div className="flex items-start gap-3.5">
        <span className={`grid size-12 shrink-0 -rotate-6 place-items-center rounded-2xl shadow-[0_5px_0_rgb(20_18_31/0.18)] ${resolved ? "bg-leaf text-white" : "bg-ink text-brand"}`} aria-hidden>
          {resolved ? <OutcomeIcon className="size-6" /> : <FileSearch className="size-6" />}
        </span>
        <div className="min-w-0">
          <h2 id="case-title" className="font-display text-xl font-extrabold leading-tight tracking-tight">
            {resolved ? t(`resolvedTitle.${outcome}`) : t("reviewTitle")}
          </h2>
          <p className="mt-1 text-sm text-ink/70">{resolved ? t(`resolvedBody.${outcome}`) : incident.reviewStartedAt ? t("reviewBodyTaken") : t("reviewBody")}</p>
        </div>
      </div>

      <ol className="mt-6 grid grid-cols-3 gap-2" aria-label={t("stepsLabel")}>
        {steps.map((step, index) => {
          const done = index < current || (resolved && index === current);
          const now = index === current && !resolved;
          return (
            <li key={step.key} className="relative flex flex-col items-center text-center">
              {index > 0 && (
                <span
                  className={`absolute right-1/2 top-[18px] h-0 w-full border-t-[3px] ${index <= current ? "border-solid border-chonta" : "border-dashed border-ink/20"}`}
                  aria-hidden
                />
              )}
              <span
                className={`relative grid size-9 place-items-center rounded-full border-[3px] text-sm font-extrabold ${
                  done ? "border-chonta bg-chonta text-white" : now ? "route-current border-ink bg-brand text-ink" : "border-ink/20 bg-white text-ink/35"
                }`}
              >
                {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : index + 1}
              </span>
              <span className={`mt-2 text-xs font-extrabold ${done || now ? "text-ink" : "text-ink/45"}`}>{t(`steps.${step.key}`)}</span>
              <span className="text-[11px] tabular-nums text-ink/50">{step.at ? time(step.at) : now ? t("now") : "—"}</span>
            </li>
          );
        })}
      </ol>

      {!resolved && (
        <p className="mt-5 flex items-start gap-2 border-t-2 border-dashed border-ink/15 pt-4 text-xs font-medium text-ink/65">
          <Phone className="mt-0.5 size-3.5 shrink-0 text-chonta" aria-hidden /> {t("contact")}
        </p>
      )}
    </section>
  );
}
