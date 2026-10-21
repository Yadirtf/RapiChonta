"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, ClipboardList, Hourglass, Inbox, Loader2, Navigation } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { can, fullName, PERMISSIONS } from "@/core/domain/entities/account";
import { alertKey, DISPATCH_POLL_MS, elapsed, needsAttention, type DispatchCourier, type DispatchOrder } from "@/core/domain/entities/dispatch";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../../auth/AuthProvider";
import { StatusBadge } from "../../../components/orders/StatusBadge";
import { Alert } from "../../../components/ui/Alert";
import { useDispatchBell } from "../../../hooks/useDispatchBell";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { usePolling, useServerClock } from "../../../hooks/usePolling";
import { usePanelMunicipality } from "../PanelMunicipality";
import { CourierRail } from "./CourierRail";
import { DispatchMap } from "./DispatchMap";
import { OrderTicket } from "./OrderTicket";

/** Villagarzón: centro del mapa mientras no hay pedidos ni domiciliarios. */
const PILOT_CENTER = { lat: 1.0294, lng: -76.6165 };

type Notice = { tone: "success" | "error"; text: string } | null;

/**
 * Central de despacho (E07). A la izquierda, el riel de comandas con los pedidos que buscan domiciliario
 * (el que más espera primero); a la derecha, el mapa y las placas de los domiciliarios en la calle para
 * enviarlo a uno o llamar a todos. Abajo, lo que ya va en camino. Se actualiza sola cada 5 s.
 */
export function DispatchView() {
  const t = useTranslations("dispatch");
  const { account } = useAuth();
  const { municipalityId, current } = usePanelMunicipality();
  const errorMessage = useErrorMessage();
  const bell = useDispatchBell();
  const canAssign = can(account, PERMISSIONS.ASSIGN_ORDERS);

  const board = usePolling(() => container.dispatch.board(municipalityId), [municipalityId], DISPATCH_POLL_MS);
  const now = useServerClock(board.data?.serverTime);
  const orders = useMemo(() => board.data?.orders ?? [], [board.data]);
  const waiting = orders.filter((o) => o.needsCourier);
  const onTheWay = orders.filter((o) => !o.needsCourier);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const selected = waiting.find((o) => o.code === selectedCode) ?? waiting[0] ?? null;
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);
  const couriers = usePolling(() => container.dispatch.couriers({ municipalityId, order: selected?.code }), [municipalityId, selected?.code], DISPATCH_POLL_MS);
  const courierList = couriers.data?.couriers ?? [];

  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  // Campana: una vez por pedido nuevo y otra si vuelve al panel sin domiciliario.
  const { announce } = bell;
  useEffect(() => {
    announce(orders.filter(needsAttention).map((o) => ({ key: alertKey(o), chime: o.returnedBy ? ("returned" as const) : ("new" as const) })));
  }, [orders, announce]);

  // La pestaña avisa cuántos esperan sin que nadie los tenga en pantalla.
  const attention = orders.filter(needsAttention).length;
  useEffect(() => {
    const base = t("documentTitle");
    document.title = attention ? `(${attention}) ${base}` : base;
    return () => {
      document.title = "Panel · RapiChonta";
    };
  }, [attention, t]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const send = useCallback(
    async (order: DispatchOrder, target: DispatchCourier | "ALL") => {
      setSending(target === "ALL" ? "ALL" : target.userId);
      try {
        const result = await container.dispatch.sendOffer(order.code, target === "ALL" ? { mode: "BROADCAST" } : { mode: "SPECIFIC", courierUserId: target.userId });
        const seconds = Math.round((new Date(result.expiresAt).getTime() - now) / 1000);
        setNotice({
          tone: "success",
          text: target === "ALL" ? t("sentAll", { count: result.recipients, seconds }) : t("sentOne", { name: target.givenNames.split(" ")[0], seconds }),
        });
        await Promise.all([board.refresh(), couriers.refresh()]);
      } catch (error) {
        setNotice({ tone: "error", text: errorMessage(error) });
        await Promise.all([board.refresh(), couriers.refresh()]);
      } finally {
        setSending(null);
      }
    },
    [board, couriers, errorMessage, now, t],
  );

  if (board.loading && !board.data) {
    return (
      <div className="grid min-h-[60dvh] place-items-center" aria-busy>
        <Loader2 className="size-6 animate-spin text-ink/40" aria-hidden />
      </div>
    );
  }

  const offered = waiting.filter((o) => o.offers.length > 0).length;

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-leaf">
            <span className="live-dot" aria-hidden /> {t("live", { seconds: DISPATCH_POLL_MS / 1000 })}
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">{t("title")}</h1>
          <p className="text-ink/60">{t("subtitle", { municipality: current?.name ?? t("yourMunicipality") })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Counter icon={<Inbox className="size-4" />} value={attention} label={t("countNew")} tone={attention ? "chonta" : "plain"} />
          <Counter icon={<Hourglass className="size-4" />} value={offered} label={t("countOffered")} tone="plain" />
          <Counter icon={<Navigation className="size-4" />} value={onTheWay.length} label={t("countOnTheWay")} tone="plain" />
          <button
            type="button"
            onClick={bell.toggle}
            aria-pressed={bell.enabled}
            className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${bell.enabled ? "bg-ink text-brand" : "bg-white text-ink/70 ring-1 ring-ink/15 hover:ring-ink/30"}`}
          >
            {bell.enabled ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
            {bell.enabled ? t("bellOn") : t("bellOff")}
          </button>
        </div>
      </header>

      {board.error ? <Alert>{errorMessage(board.error)}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,400px)_1fr]">
        {/* Riel de comandas */}
        <section aria-labelledby="rail-title" className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 id="rail-title" className="font-display text-lg font-extrabold">
              {t("railTitle", { count: waiting.length })}
            </h2>
            <span className="text-xs font-semibold text-ink/45">{t("railOrder")}</span>
          </div>
          <div className="dispatch-rail" aria-hidden />
          {waiting.length === 0 ? (
            <div className="-mt-1 flex flex-col items-center rounded-[28px] border-2 border-dashed border-ink/10 px-6 py-12 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-white text-ink/35 shadow-sm">
                <ClipboardList className="size-6" aria-hidden />
              </span>
              <p className="mt-4 font-bold">{t("emptyTitle")}</p>
              <p className="mt-1 max-w-xs text-sm text-ink/55">{t("emptyBody")}</p>
            </div>
          ) : (
            <motion.ol layout className="-mt-1 flex flex-col gap-7 pt-2 xl:max-h-[calc(100dvh-260px)] xl:overflow-y-auto xl:px-1 xl:pb-4">
              <AnimatePresence initial={false}>
                {waiting.map((order) => (
                  <li key={order.code}>
                    <OrderTicket order={order} now={now} selected={order.code === selected?.code} onSelect={() => setSelectedCode(order.code)} />
                  </li>
                ))}
              </AnimatePresence>
            </motion.ol>
          )}
        </section>

        {/* Mapa y domiciliarios */}
        <section className="flex min-w-0 flex-col gap-5">
          <div className="relative h-[360px] overflow-hidden rounded-[28px] shadow-sm ring-1 ring-ink/10 sm:h-[440px]">
            <DispatchMap
              center={PILOT_CENTER}
              orders={orders}
              couriers={courierList}
              selectedOrder={selected}
              selectedCourierId={selectedCourierId}
              onSelectOrder={setSelectedCode}
              onSelectCourier={setSelectedCourierId}
            />
            {selected && (
              <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between gap-2">
                <span className="pointer-events-auto rounded-2xl bg-ink/90 px-3.5 py-2 text-white shadow-lg backdrop-blur-sm">
                  <span className="block font-display text-sm font-extrabold text-brand">{selected.code}</span>
                  <span className="block text-xs text-white/75">
                    {selected.establishment.name} → {selected.delivery.zoneName}
                  </span>
                </span>
              </div>
            )}
          </div>

          {couriers.error ? <Alert>{errorMessage(couriers.error)}</Alert> : null}
          <CourierRail
            order={selected}
            couriers={courierList}
            freshSeconds={couriers.data?.freshSeconds ?? 120}
            now={now}
            canAssign={canAssign}
            selectedCourierId={selectedCourierId}
            sending={sending}
            onSelectCourier={setSelectedCourierId}
            onSendOne={(c) => selected && void send(selected, c)}
            onSendAll={() => selected && void send(selected, "ALL")}
          />
        </section>
      </div>

      {onTheWay.length > 0 && (
        <section aria-labelledby="road-title" className="flex flex-col gap-3">
          <h2 id="road-title" className="font-display text-lg font-extrabold">
            {t("roadTitle", { count: onTheWay.length })}
          </h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {onTheWay.map((o) => (
              <li key={o.code} className="ticket flex min-w-0 items-center gap-4 rounded-2xl px-5 py-4 text-white">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-extrabold text-brand">{o.code}</p>
                  <p className="truncate text-sm text-white/75">
                    {o.establishment.name} → {o.delivery.zoneName}
                  </p>
                  {o.courier && (
                    <p className="mt-1 truncate text-xs text-white/70">
                      {t("withCourier", { name: fullName(o.courier), time: elapsed((now - new Date(o.courier.assignedAt).getTime()) / 1000) })}
                    </p>
                  )}
                </div>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            role="status"
            className={`fixed bottom-5 left-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 rounded-2xl px-5 py-3.5 text-sm font-bold shadow-2xl ${notice.tone === "success" ? "bg-ink text-white" : "bg-chonta text-white"}`}
          >
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Counter({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: "chonta" | "plain" }) {
  return (
    <span className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold ${tone === "chonta" ? "bg-chonta text-white" : "bg-white text-ink ring-1 ring-ink/10"}`}>
      <span aria-hidden className={tone === "chonta" ? "" : "text-ink/50"}>
        {icon}
      </span>
      <span className="font-display text-base font-extrabold tabular-nums">{value}</span>
      <span className={tone === "chonta" ? "text-white/85" : "text-ink/55"}>{label}</span>
    </span>
  );
}
