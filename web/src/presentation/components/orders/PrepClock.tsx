"use client";

import { ChefHat, Flame } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OrderDetail } from "@/core/domain/entities/order";
import { mmss, useCountdown } from "../../hooks/useCountdown";

/** Desde cuándo se prepara: la parada PREPARING de la ruta (la hora en que el domiciliario pagó en el local). */
const preparingSince = (order: Pick<OrderDetail, "timeline">) => [...order.timeline].reverse().find((t) => t.status === "PREPARING")?.at ?? null;

/**
 * H09.1: la cuenta regresiva de preparación en el tiquete. Al cumplirse no queda en 0:00: dice que ya casi sale, y
 * si el domiciliario avisó que sigue en preparación, que el local tiene mucha demanda.
 */
export function PrepCountdown({ preparation, tone = "dark" }: { preparation: NonNullable<OrderDetail["preparation"]>; tone?: "dark" | "light" }) {
  const t = useTranslations("orders");
  const left = useCountdown(new Date(preparation.estimatedReadyAt).getTime());
  const accent = tone === "dark" ? "text-brand" : "text-chonta-strong";
  if (left === 0) {
    return (
      <span className={`flex items-center gap-1.5 font-bold ${accent}`}>
        <Flame className="size-3.5" aria-hidden /> {preparation.delayed ? t("prepBusy") : t("prepAlmost")}
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1.5 font-bold ${accent}`} aria-label={t("prepLeftLabel", { time: mmss(left) })}>
      <ChefHat className="size-3.5" aria-hidden />
      {t("prepLeft")} <span className="font-mono text-sm tabular-nums tracking-wide">{mmss(left)}</span>
    </span>
  );
}

/**
 * La parada "Preparando" de la ruta: un fogón que se va llenando de la compra a la hora estimada. La llama se queda
 * en la punta; si el local va atrasado, la barra se queda llena y la llama late.
 */
export function PrepStove({ order }: { order: Pick<OrderDetail, "timeline" | "preparation"> }) {
  const t = useTranslations("orders");
  const since = preparingSince(order);
  const ready = order.preparation ? new Date(order.preparation.estimatedReadyAt).getTime() : null;
  const left = useCountdown(ready);
  if (!order.preparation || !since || !ready) return null;
  const total = Math.max(1, ready - new Date(since).getTime());
  const done = Math.min(1, Math.max(0.04, 1 - (left * 1000) / total));
  return (
    <div className="mt-2.5 max-w-sm">
      <div className="relative h-2.5 rounded-full bg-chonta-soft" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)} aria-label={t("prepProgress")}>
        <div className="h-full rounded-full bg-gradient-to-r from-brand to-chonta transition-[width] duration-1000 ease-linear" style={{ width: `${done * 100}%` }} />
        <span
          className={`absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink text-brand shadow ${left === 0 ? "route-current" : ""}`}
          style={{ left: `${done * 100}%` }}
          aria-hidden
        >
          <Flame className="size-3.5" />
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold text-ink/55">
        <PrepCountdown preparation={order.preparation} tone="light" />
      </p>
    </div>
  );
}
