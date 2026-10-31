"use client";

import { motion } from "framer-motion";
import { useLocale } from "next-intl";
import { orderRoute, type OrderDetail } from "@/core/domain/entities/order";
import { statusIcon, statusTone } from "./orderVisuals";
import { PrepStove } from "./PrepClock";
import { useStatusText } from "./useStatusText";

/**
 * Línea de tiempo del pedido (RF-50) como la ruta de la moto: paradas cumplidas en chontaduro, la actual
 * latiendo en amarillo y las que faltan en punteado. Nunca muestra dónde está el domiciliario.
 */
export function OrderRoute({
  order,
  timeZone = "America/Bogota",
}: {
  order: Pick<OrderDetail, "timeline" | "journey" | "active"> & Partial<Pick<OrderDetail, "preparation" | "fulfillmentMode">>;
  timeZone?: string;
}) {
  const text = useStatusText(order.fulfillmentMode);
  const locale = useLocale();
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
  const stops = orderRoute(order);

  return (
    <ol className="flex flex-col">
      {stops.map((stop, index) => {
        const Icon = statusIcon(stop.status);
        const last = index === stops.length - 1;
        const nextDone = !last && stops[index + 1].state !== "upcoming";
        const attention = stop.state === "current" && statusTone(stop.status) === "attention";
        const label = text(stop.status, "label");
        const body = stop.state === "current" ? text(stop.status, "body") : null;
        return (
          <motion.li
            key={`${stop.status}-${index}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04 }}
            className="relative flex gap-4"
            aria-current={stop.state === "current" ? "step" : undefined}
          >
            <div className="flex w-10 shrink-0 flex-col items-center">
              <span
                className={`relative z-10 grid size-10 place-items-center rounded-full border-[3px] ${
                  stop.state === "upcoming"
                    ? "border-dashed border-ink/20 bg-white text-ink/30"
                    : stop.state === "current"
                      ? `route-current ${attention ? "border-chonta bg-chonta text-white" : "border-ink bg-brand text-ink"}`
                      : "border-chonta bg-chonta text-white"
                }`}
              >
                <Icon className="size-[18px]" strokeWidth={2.5} aria-hidden />
              </span>
              {!last && <span className={`route-road w-[3px] flex-1 ${nextDone ? "is-done" : ""}`} aria-hidden />}
            </div>
            <div className={`min-w-0 flex-1 ${last ? "pb-1" : "pb-6"} pt-1.5`}>
              <p className={`flex flex-wrap items-baseline gap-x-2 font-bold ${stop.state === "upcoming" ? "text-ink/40" : "text-ink"}`}>
                {label}
                {stop.at && <span className="text-xs font-semibold tabular-nums text-ink/45">{time(stop.at)}</span>}
              </p>
              {body && <p className="mt-0.5 text-sm text-ink/60">{body}</p>}
              {stop.state === "current" && stop.status === "PREPARING" && order.preparation && <PrepStove order={{ timeline: order.timeline, preparation: order.preparation }} />}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
