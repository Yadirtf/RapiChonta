"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bike, Hourglass, Megaphone, Phone, Send, Signal, SignalZero, ThumbsDown, WalletMinimal } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DispatchCourier, DispatchOrder, LocatedCourier } from "@/core/domain/entities/dispatch";
import { elapsed } from "@/core/domain/entities/dispatch";
import { Button } from "../../../components/ui/Button";
import { formatPhone, initials } from "../../../format";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";

interface Props {
  order: DispatchOrder | null;
  couriers: LocatedCourier[];
  /** En turno pero sin ubicación reciente: no se les puede ofrecer. */
  silent: DispatchCourier[];
  freshSeconds: number;
  now: number;
  canAssign: boolean;
  selectedCourierId: string | null;
  sending: string | null;
  onSelectCourier: (userId: string) => void;
  onSendOne: (courier: DispatchCourier) => void;
  onSendAll: () => void;
}

/**
 * Los domiciliarios en la calle (H07.2): verificados, con Disponible activo y vistos en los últimos 2 minutos,
 * del más cerca al más lejos del local del pedido elegido. Cada uno es una placa con su moto; desde aquí se
 * envía a uno o se llama a todos (H07.3). Debajo, los que activaron Disponible pero su teléfono no reporta
 * ubicación: no se les ofrece, pero el operador ve que están en turno y puede llamarlos.
 */
export function CourierRail({ order, couriers, silent, freshSeconds, now, canAssign, selectedCourierId, sending, onSelectCourier, onSendOne, onSendAll }: Props) {
  const t = useTranslations("dispatch");
  const { distance } = useCatalogFormat();
  const dispatchable = !!order?.needsCourier && canAssign;
  const callable = couriers.filter((c) => !c.hasPendingOffer && !c.declined && c.cashReady).length;

  return (
    <section aria-labelledby="couriers-title" className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="couriers-title" className="font-display text-lg font-extrabold">
            {t("couriersTitle", { count: couriers.length })}
          </h2>
          <p className="text-xs text-ink/55">{order ? t("couriersByDistance", { store: order.establishment.name }) : t("couriersHint", { minutes: Math.round(freshSeconds / 60) })}</p>
        </div>
        {dispatchable && (
          <Button variant="dark" onClick={onSendAll} loading={sending === "ALL"} disabled={!callable || !!sending} className="!rounded-full">
            <Megaphone className="size-4 text-brand" aria-hidden />
            {t("sendAll", { count: callable })}
          </Button>
        )}
      </div>

      {couriers.length === 0 ? (
        <div className="flex items-center gap-4 rounded-3xl border-2 border-dashed border-ink/12 bg-white/60 p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cream text-ink/40">
            <Bike className="size-6" aria-hidden />
          </span>
          <div>
            <p className="font-bold">{t("noCouriersTitle")}</p>
            <p className="text-sm text-ink/55">{t("noCouriersBody", { minutes: Math.round(freshSeconds / 60) })}</p>
          </div>
        </div>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {couriers.map((c, index) => {
              const seen = Math.max(0, (now - new Date(c.lastSeenAt).getTime()) / 1000);
              const stale = seen > freshSeconds * 0.6;
              return (
                <motion.li
                  key={c.userId}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className={`group relative flex flex-col gap-3 rounded-3xl bg-white p-3.5 shadow-sm ring-1 transition ${c.userId === selectedCourierId ? "ring-2 ring-ink" : "ring-ink/8 hover:ring-ink/20"}`}
                >
                  <button type="button" onClick={() => onSelectCourier(c.userId)} className="flex items-center gap-3 text-left" aria-pressed={c.userId === selectedCourierId}>
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand font-display text-sm font-extrabold text-ink">
                      {initials(c.givenNames, c.familyNames)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">
                        {c.givenNames} {c.familyNames ?? ""}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-ink/55">
                        <Signal className={`size-3.5 ${stale ? "text-chonta" : "text-leaf"}`} aria-hidden />
                        {t("seenAgo", { time: elapsed(seen) })}
                      </span>
                    </span>
                    {c.vehicle?.plate ? (
                      <span className="moto-plate !min-w-0 shrink-0 scale-75 origin-right">
                        <b>{c.vehicle.plate}</b>
                        <small>{t(`vehicle.${c.vehicle.type}`)}</small>
                      </span>
                    ) : c.vehicle ? (
                      <span className="shrink-0 rounded-full bg-cream px-2 py-1 text-[11px] font-bold text-ink/70">{t(`vehicle.${c.vehicle.type}`)}</span>
                    ) : null}
                  </button>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.distanceMeters !== null && (
                      <span className="rounded-full bg-ink px-2.5 py-1 font-display text-xs font-extrabold text-brand">{t("toStore", { distance: distance(c.distanceMeters) })}</span>
                    )}
                    {order && index === 0 && c.distanceMeters !== null && (
                      <span className="rounded-full bg-leaf px-2.5 py-1 text-xs font-extrabold text-white">{t("closest")}</span>
                    )}
                    {c.hasPendingOffer && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink/75">
                        <Hourglass className="size-3" aria-hidden /> {t("hasIt")}
                      </span>
                    )}
                    {!c.cashReady && (
                      <Link href="/panel/cajas" className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-brand hover:bg-ink/85" title={t("noCashBoxHint")}>
                        <WalletMinimal className="size-3" aria-hidden /> {t("noCashBox")}
                      </Link>
                    )}
                    {c.declined && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-chonta-soft px-2.5 py-1 text-xs font-bold text-chonta-strong">
                        <ThumbsDown className="size-3" aria-hidden /> {t("saidNo")}
                      </span>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-ink/60 hover:bg-ink/5" title={formatPhone(c.phone)}>
                        <Phone className="size-3.5" aria-hidden /> {t("call")}
                      </a>
                    )}
                  </div>

                  {dispatchable && (
                    <Button size="sm" variant={index === 0 ? "primary" : "outline"} onClick={() => onSendOne(c)} loading={sending === c.userId} disabled={c.hasPendingOffer || !c.cashReady || !!sending}>
                      <Send className="size-3.5" aria-hidden />
                      {t("sendTo", { name: c.givenNames.split(" ")[0] })}
                    </Button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {silent.length > 0 && <SilentCouriers couriers={silent} now={now} />}
    </section>
  );
}

function SilentCouriers({ couriers, now }: { couriers: DispatchCourier[]; now: number }) {
  const t = useTranslations("dispatch");
  return (
    <div className="flex flex-col gap-2.5 rounded-3xl border-2 border-dashed border-chonta/30 bg-chonta-soft/40 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-chonta-strong">
          <SignalZero className="size-5" aria-hidden />
        </span>
        <div>
          <p className="font-bold">{t("silentTitle", { count: couriers.length })}</p>
          <p className="text-sm text-ink/60">{t("silentBody")}</p>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {couriers.map((c) => (
          <li key={c.userId} className="flex items-center gap-3 rounded-2xl bg-white/80 p-2.5 ring-1 ring-ink/8">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cream font-display text-xs font-extrabold text-ink/60">
              {initials(c.givenNames, c.familyNames)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">
                {c.givenNames} {c.familyNames ?? ""}
              </span>
              <span className="block text-xs text-ink/55">
                {c.lastSeenAt
                  ? t("lastLocationAgo", { time: elapsed((now - new Date(c.lastSeenAt).getTime()) / 1000) })
                  : t("neverLocated")}
              </span>
            </span>
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-ink/60 hover:bg-ink/5" title={formatPhone(c.phone)}>
                <Phone className="size-3.5" aria-hidden /> {t("call")}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
