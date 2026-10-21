"use client";

import { ExternalLink, Flame, ReceiptText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Dialog } from "../ui/Dialog";

/**
 * La factura que fotografió el domiciliario al pagar en el local (H08.4). La URL viene firmada y vence sola:
 * se muestra tal cual, sin guardarla. Se abre en grande para leer el total.
 */
export function ReceiptButton({ url, code, variant = "light" }: { url: string; code: string; variant?: "light" | "dark" }) {
  const t = useTranslations("orders");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          // Dentro de una comanda (que también es botón) no la selecciona.
          event.stopPropagation();
          setOpen(true);
        }}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition ${
          variant === "dark" ? "bg-white/10 text-brand hover:bg-white/20" : "bg-cream text-chonta-strong hover:bg-brand/30"
        }`}
      >
        <ReceiptText className="size-4" aria-hidden />
        {t("seeReceipt")}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("receiptTitle", { code })} size="lg" closeLabel={t("close")}>
        <figure className="receipt-edge overflow-hidden rounded-b-2xl bg-cream p-3 pt-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada que vence: no pasa por el optimizador */}
          <img src={url} alt={t("receiptAlt", { code })} className="mx-auto max-h-[70dvh] w-auto rounded-xl object-contain shadow-md" />
        </figure>
        <a href={url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-chonta-strong hover:underline">
          <ExternalLink className="size-4" aria-hidden /> {t("receiptOpen")}
        </a>
      </Dialog>
    </>
  );
}

/** H08.5: el domiciliario avisó que el local sigue preparando. Para el cliente es alta demanda, sin culpas. */
export function HighDemandNote({ store }: { store: string }) {
  const t = useTranslations("orders");
  return (
    <div role="status" className="flex items-start gap-3 rounded-[22px] border border-chonta/35 bg-chonta-soft p-4">
      <span className="grid size-10 shrink-0 -rotate-6 place-items-center rounded-xl bg-chonta text-white" aria-hidden>
        <Flame className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-display font-extrabold text-chonta-strong">{t("highDemandTitle", { store })}</p>
        <p className="mt-0.5 text-sm text-ink/70">{t("highDemandBody")}</p>
      </div>
    </div>
  );
}
