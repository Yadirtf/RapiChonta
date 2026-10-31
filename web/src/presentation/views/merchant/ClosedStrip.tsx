"use client";

import { ChevronDown } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import type { CounterOrder } from "@/core/domain/entities/merchant";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";

/** Cómo terminó en el local: salió con el domiciliario, se entregó, lo rechazó el comercio o lo canceló RapiChonta. */
function outcome(order: CounterOrder): "PICKED_UP" | "DECLINED" | "CANCELLED" {
  if (order.pickedUpAt) return "PICKED_UP";
  return order.cancellation?.byMerchant ? "DECLINED" : "CANCELLED";
}

const STAMP = {
  PICKED_UP: "text-leaf",
  DECLINED: "text-chonta-strong",
  CANCELLED: "text-ink/50",
} as const;

/** Lo que ya salió del mostrador en las últimas horas, como el talonario de comandas despachadas. */
export function ClosedStrip({ orders, hours }: { orders: CounterOrder[]; hours: number }) {
  const t = useTranslations("merchant.closed");
  const tr = useTranslations("merchant.declineReasons");
  const format = useFormatter();
  const { price } = useCatalogFormat();
  const [open, setOpen] = useState(false);
  if (!orders.length) return null;
  const pickedUp = orders.filter((o) => o.pickedUpAt);
  const total = pickedUp.reduce((sum, o) => sum + Number(o.itemsTotal), 0);

  return (
    <section className="rounded-[28px] bg-white p-4 ring-1 ring-ink/5 sm:p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-extrabold tracking-tight">{t("title", { hours })}</h2>
          <p className="text-sm text-ink/55">
            {t("summary", {
              count: pickedUp.length,
              total: price(total.toFixed(2)),
            })}
          </p>
        </div>
        <ChevronDown className={`size-5 text-ink/50 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul className="mt-4 divide-y divide-dashed divide-ink/10">
          {orders.map((order) => {
            const kind = outcome(order);
            return (
              <li key={order.code} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="font-display text-lg font-extrabold tracking-tight">{order.code}</span>
                <span className="text-sm text-ink/60">{order.lines.map((l) => `${l.quantity}× ${l.name}`).join(" · ")}</span>
                <span className="ml-auto flex items-center gap-3">
                  {order.closedAt && (
                    <span className="text-xs tabular-nums text-ink/45">
                      {format.dateTime(new Date(order.closedAt), {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  <span className={`stamp ${STAMP[kind]}`}>{t(kind)}</span>
                </span>
                {kind === "DECLINED" && order.cancellation && <span className="w-full text-xs text-ink/50">{tr(order.cancellation.reason)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
