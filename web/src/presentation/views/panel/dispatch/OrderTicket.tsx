"use client";

import { motion } from "framer-motion";
import { Clock, Megaphone, MapPin, ShoppingBag, UserRound } from "lucide-react";
import { createElement } from "react";
import { useTranslations } from "next-intl";
import { elapsed, needsAttention, soonestOffer, waitTone, type DispatchOrder } from "@/core/domain/entities/dispatch";
import { paymentIcon } from "../../../components/orders/orderVisuals";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";

const WAIT_TONES = {
  fresh: "bg-leaf text-white",
  warm: "bg-brand text-ink",
  late: "bg-chonta text-white animate-pulse",
} as const;

/**
 * Comanda del riel (H07.1): código grande como en la cocina, de dónde a dónde, qué hay que comprar y cuánto
 * lleva esperando. Una nueva late hasta que se envía; una que volvió trae el sello de por qué.
 */
export function OrderTicket({ order, now, selected, onSelect }: { order: DispatchOrder; now: number; selected: boolean; onSelect: () => void }) {
  const t = useTranslations("dispatch");
  const tp = useTranslations("payment");
  const { price } = useCatalogFormat();
  const waiting = order.waitingSince ? (now - new Date(order.waitingSince).getTime()) / 1000 : 0;
  const fresh = needsAttention(order);
  const offer = soonestOffer(order);
  const remaining = offer ? Math.max(0, (new Date(offer.expiresAt).getTime() - now) / 1000) : 0;
  const total = offer ? Math.max(1, (new Date(offer.expiresAt).getTime() - new Date(offer.sentAt).getTime()) / 1000) : 1;
  const pending = offer?.recipients.filter((r) => r.status === "PENDING") ?? [];
  const declined = order.offers.flatMap((o) => o.recipients).filter((r) => r.status === "REJECTED");

  return (
    <motion.button
      layout
      type="button"
      initial={{ opacity: 0, y: -18, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      onClick={onSelect}
      aria-pressed={selected}
      className={`comanda block w-full px-4 pb-4 pt-5 text-left ${fresh && !order.returnedBy ? "is-new" : ""} ${order.returnedBy && fresh ? "is-returned" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-2xl font-extrabold leading-none tracking-tight">{order.code}</p>
          <p className="mt-1 truncate text-sm font-bold">{order.establishment.name}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums ${WAIT_TONES[waitTone(waiting)]}`} title={t("waitingTitle")}>
          <Clock className="size-3.5" strokeWidth={2.6} aria-hidden />
          {elapsed(waiting)}
        </span>
      </div>

      {fresh && (
        <div className="mt-2">
          {order.returnedBy ? (
            <span className="stamp text-chonta-strong">{t(`returned.${order.returnedBy === "OFFERS_DECLINED" ? "OFFERS_DECLINED" : "TIMER"}`)}</span>
          ) : (
            <span className="stamp text-chonta">{t("newStamp")}</span>
          )}
        </div>
      )}

      <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 text-[13px]">
        <MapPin className="size-4 text-chonta-strong" aria-hidden />
        <dd className="truncate text-ink/75">
          {order.delivery.zoneName}
          {order.delivery.reference ? ` · ${order.delivery.reference}` : ""}
        </dd>
        <ShoppingBag className="size-4 text-ink/50" aria-hidden />
        <dd className="text-ink/75">
          {t("toBuy", { count: order.itemCount })} <b className="font-extrabold text-ink">{price(order.itemsTotal)}</b>
          <span className="text-ink/45"> · {t("fee")} {price(order.deliveryFee)}</span>
        </dd>
        {createElement(paymentIcon(order.paymentMethod), { className: "size-4 text-ink/50", "aria-hidden": true })}
        <dd className="text-ink/75">{tp.has(order.paymentMethod) ? tp(order.paymentMethod) : order.paymentMethod}</dd>
      </dl>

      {offer && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/70 p-2.5 ring-1 ring-ink/10">
          <span className="offer-clock shrink-0" style={{ ["--p" as string]: String(remaining / total) }} aria-hidden>
            <span>{elapsed(remaining)}</span>
          </span>
          <div className="min-w-0 text-[13px]">
            <p className="flex items-center gap-1.5 font-extrabold">
              {offer.mode === "BROADCAST" ? <Megaphone className="size-3.5 text-chonta" aria-hidden /> : <UserRound className="size-3.5 text-chonta" aria-hidden />}
              {offer.mode === "BROADCAST"
                ? t("waitingMany", { count: pending.length })
                : t("waitingOne", { name: pending[0]?.givenNames.split(" ")[0] ?? offer.recipients[0]?.givenNames.split(" ")[0] ?? "" })}
            </p>
            {offer.sentBy && <p className="truncate text-ink/50">{t("sentBy", { name: offer.sentBy.givenNames.split(" ")[0] })}</p>}
          </div>
        </div>
      )}

      {declined.length > 0 && (
        <p className="mt-2 text-xs font-semibold text-ink/55">{t("declinedBy", { names: declined.map((d) => d.givenNames.split(" ")[0]).join(", ") })}</p>
      )}
    </motion.button>
  );
}
