"use client";

import { motion } from "framer-motion";
import { Bike, Clock, FileSearch, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { fullName } from "@/core/domain/entities/account";
import { isPriority, type DeskOrder } from "@/core/domain/entities/desk";
import { elapsed, waitTone } from "@/core/domain/entities/dispatch";
import { StatusBadge } from "../../../components/orders/StatusBadge";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";
import { ALERT_LOOK } from "./deskVisuals";

const STATE_TONES = {
  fresh: "bg-ink/[0.06] text-ink/70",
  warm: "bg-brand text-ink",
  late: "bg-chonta text-white",
} as const;

/**
 * La comanda del pase (H10.5): el código grande, de dónde a dónde, cuánto lleva en ese estado y los sellos de sus
 * alertas (la más urgente primero). Una con novedad va en papel chontaduro; una de prioridad late hasta que se mira.
 */
export function DeskTicket({ order, now, selected, onOpen }: { order: DeskOrder; now: number; selected: boolean; onOpen: () => void }) {
  const t = useTranslations("desk");
  const { price } = useCatalogFormat();
  const inState = (now - new Date(order.statusSince).getTime()) / 1000;
  const hasIncident = order.alerts.some((a) => a.code === "INCIDENT");
  const [first, ...rest] = order.alerts;

  return (
    <motion.button
      layout
      type="button"
      initial={{ opacity: 0, y: -18, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      onClick={onOpen}
      aria-pressed={selected}
      className={`comanda block w-full px-4 pb-4 pt-5 text-left ${isPriority(order) && !selected ? "is-new" : ""} ${hasIncident ? "is-returned" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl font-extrabold leading-none tracking-tight">{order.code}</p>
          <p className="mt-1 truncate text-sm font-bold">{order.establishment.name}</p>
          <p className="truncate text-xs text-ink/55">→ {order.zoneName}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums ${STATE_TONES[waitTone(inState)]}`} title={t("inStateTitle")}>
          <Clock className="size-3.5" strokeWidth={2.6} aria-hidden />
          {elapsed(inState)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <span className="text-xs font-bold tabular-nums text-ink/60">{price(order.total)}</span>
      </div>

      {first && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`stamp ${ALERT_LOOK[first.code].ink}`}>{t(`alerts.${first.code}.short`)}</span>
          {rest.map((alert) => {
            const Icon = ALERT_LOOK[alert.code].icon;
            return (
              <span key={alert.code} className={`grid size-7 place-items-center rounded-full ${ALERT_LOOK[alert.code].chip}`} title={t(`alerts.${alert.code}.short`)}>
                <Icon className="size-3.5" aria-hidden />
                <span className="sr-only">{t(`alerts.${alert.code}.short`)}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1 border-t-2 border-dashed border-ink/10 pt-2.5 text-xs text-ink/65">
        <span className="flex min-w-0 items-center gap-1.5">
          {order.courier ? <Bike className="size-3.5 shrink-0 text-ink/45" aria-hidden /> : <UserRound className="size-3.5 shrink-0 text-ink/35" aria-hidden />}
          <span className="truncate">{order.courier ? fullName(order.courier) : t("noCourier")}</span>
        </span>
        {order.incident && (
          <span className="flex min-w-0 items-center gap-1.5 font-semibold text-chonta-strong">
            <FileSearch className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{order.incident.takenBy ? t("takenBy", { name: order.incident.takenBy.givenNames.split(" ")[0] }) : t("nobodyYet")}</span>
          </span>
        )}
      </div>
    </motion.button>
  );
}
