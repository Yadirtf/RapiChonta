"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, Loader2, PackageOpen, Siren, Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { alertKeys, DESK_ALERTS, DESK_LANES, DESK_POLL_MS, isPriority, laneOf, type DeskAlertCode, type DeskLane, type DeskOrder } from "@/core/domain/entities/desk";
import { container } from "@/infrastructure/di/container";
import { Alert } from "../../../components/ui/Alert";
import { useDispatchBell } from "../../../hooks/useDispatchBell";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { usePolling, useServerClock } from "../../../hooks/usePolling";
import { usePanelMunicipality } from "../PanelMunicipality";
import { ALERT_LOOK } from "./deskVisuals";
import { DeskOrderSheet } from "./DeskOrderSheet";
import { DeskTicket } from "./DeskTicket";

export type DeskNotice = { tone: "success" | "error"; text: string } | null;

/**
 * H10.5 · Pedidos en curso. El pase de la cocina: un carril por etapa (por asignar, en el local, en camino, por
 * revisar y cerrados con algo pendiente), cada pedido como comanda colgada con los sellos de sus alertas. Las de
 * prioridad (novedad, foto por revisar, nadie aceptó) laten y suenan una vez. Al tocar una se abre su expediente.
 */
export function DeskView() {
  const t = useTranslations("desk");
  const { municipalityId, current } = usePanelMunicipality();
  const errorMessage = useErrorMessage();
  const bell = useDispatchBell();

  const board = usePolling(() => container.desk.board(municipalityId), [municipalityId], DESK_POLL_MS);
  const now = useServerClock(board.data?.serverTime);
  const orders = useMemo(() => board.data?.orders ?? [], [board.data]);

  const [chosen, setFilter] = useState<DeskAlertCode | "ALL">("ALL");
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<DeskNotice>(null);

  const counts = useMemo(() => {
    const byAlert = new Map<DeskAlertCode, number>();
    for (const order of orders) for (const alert of order.alerts) byAlert.set(alert.code, (byAlert.get(alert.code) ?? 0) + 1);
    return byAlert;
  }, [orders]);
  const priority = orders.filter(isPriority).length;
  const live = orders.filter((o) => laneOf(o) !== "closed").length;

  // Si el filtro se quedó sin pedidos (se resolvió lo último), se ve "Todo".
  const filter = chosen !== "ALL" && counts.get(chosen) ? chosen : "ALL";
  const visible = filter === "ALL" ? orders : orders.filter((o) => o.alerts.some((a) => a.code === filter));
  const lanes = useMemo(() => {
    const grouped = new Map<DeskLane, DeskOrder[]>([...DESK_LANES, "closed" as const].map((lane) => [lane, []]));
    for (const order of visible) grouped.get(laneOf(order))!.push(order);
    return grouped;
  }, [visible]);

  // La campana suena una vez por alerta de prioridad; una novedad suena con las notas graves.
  const { announce } = bell;
  useEffect(() => {
    announce(orders.flatMap((o) => alertKeys(o).map((key) => ({ key, chime: key.includes(":INCIDENT@") ? ("returned" as const) : ("new" as const) }))));
  }, [orders, announce]);

  useEffect(() => {
    const base = t("documentTitle");
    document.title = priority ? `(${priority}) ${base}` : base;
    return () => {
      document.title = "Panel · RapiChonta";
    };
  }, [priority, t]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (board.loading && !board.data) {
    return (
      <div className="grid min-h-[60dvh] place-items-center" aria-busy>
        <Loader2 className="size-6 animate-spin text-ink/40" aria-hidden />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-leaf">
            <span className="live-dot" aria-hidden /> {t("live", { seconds: DESK_POLL_MS / 1000 })}
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">{t("title")}</h1>
          <p className="text-ink/60">{t("subtitle", { municipality: current?.name ?? t("yourMunicipality") })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold ${priority ? "bg-chonta text-white" : "bg-white text-ink ring-1 ring-ink/10"}`}>
            <Siren className={`size-4 ${priority ? "" : "text-ink/50"}`} aria-hidden />
            <span className="font-display text-base font-extrabold tabular-nums">{priority}</span>
            <span className={priority ? "text-white/85" : "text-ink/55"}>{t("countPriority")}</span>
          </span>
          <span className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold ring-1 ring-ink/10">
            <Waypoints className="size-4 text-ink/50" aria-hidden />
            <span className="font-display text-base font-extrabold tabular-nums">{live}</span>
            <span className="text-ink/55">{t("countLive")}</span>
          </span>
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

      {/* Los sellos de la jornada: tocar uno deja solo los pedidos con esa alerta. */}
      <nav aria-label={t("filtersLabel")} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")} label={t("filterAll")} count={orders.length} />
        {DESK_ALERTS.filter((code) => counts.get(code)).map((code) => {
          const look = ALERT_LOOK[code];
          return (
            <FilterChip
              key={code}
              active={filter === code}
              onClick={() => setFilter(filter === code ? "ALL" : code)}
              label={t(`alerts.${code}.short`)}
              count={counts.get(code) ?? 0}
              icon={<look.icon className={`size-4 ${filter === code ? "" : look.ink}`} aria-hidden />}
            />
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center rounded-[28px] border-2 border-dashed border-ink/10 px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-white text-ink/35 shadow-sm">
            <PackageOpen className="size-6" aria-hidden />
          </span>
          <p className="mt-4 font-bold">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-sm text-sm text-ink/55">{t("emptyBody")}</p>
        </div>
      ) : (
        <>
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-4 xl:overflow-visible">
            {DESK_LANES.map((lane) => {
              const list = lanes.get(lane)!;
              return (
                // En el teléfono un carril vacío no ocupa una pantalla entera: solo se ve en el pase completo.
                <section
                  key={lane}
                  aria-labelledby={`lane-${lane}`}
                  className={`w-[290px] shrink-0 snap-start flex-col gap-4 xl:flex xl:w-auto xl:min-w-0 ${list.length ? "flex" : "hidden"}`}
                >
                  <div className="flex items-baseline justify-between gap-2 px-1">
                    <h2 id={`lane-${lane}`} className="font-display text-base font-extrabold">
                      {t(`lanes.${lane}.title`)}
                    </h2>
                    <span className="font-display text-sm font-extrabold tabular-nums text-ink/40">{list.length}</span>
                  </div>
                  <div className="dispatch-rail" aria-hidden />
                  {list.length === 0 ? (
                    <p className="-mt-1 rounded-2xl border-2 border-dashed border-ink/10 px-4 py-6 text-center text-xs font-semibold text-ink/40">{t(`lanes.${lane}.empty`)}</p>
                  ) : (
                    <motion.ol layout className="-mt-1 flex flex-col gap-7 pt-2">
                      <AnimatePresence initial={false}>
                        {list.map((order) => (
                          <li key={order.code}>
                            <DeskTicket order={order} now={now} selected={order.code === openCode} onOpen={() => setOpenCode(order.code)} />
                          </li>
                        ))}
                      </AnimatePresence>
                    </motion.ol>
                  )}
                </section>
              );
            })}
          </div>

          {/* Cerrados que aún deben algo a la caja: el cajón de los recibos, aparte del pase. */}
          {lanes.get("closed")!.length > 0 && (
            <section aria-labelledby="lane-closed" className="flex flex-col gap-4 rounded-[28px] bg-white/60 p-4 ring-1 ring-ink/5 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <h2 id="lane-closed" className="font-display text-base font-extrabold">
                    {t("lanes.closed.title")} <span className="tabular-nums text-ink/40">· {lanes.get("closed")!.length}</span>
                  </h2>
                  <p className="text-sm text-ink/55">{t("lanes.closed.body")}</p>
                </div>
              </div>
              <ol className="grid grid-cols-1 gap-x-5 gap-y-8 pt-3 sm:grid-cols-2 xl:grid-cols-4">
                {lanes.get("closed")!.map((order) => (
                  <li key={order.code}>
                    <DeskTicket order={order} now={now} selected={order.code === openCode} onOpen={() => setOpenCode(order.code)} />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <DeskOrderSheet
        code={openCode}
        now={now}
        onClose={() => setOpenCode(null)}
        onDone={(text) => {
          setNotice({ tone: "success", text });
          void board.refresh();
        }}
        onFailed={(error) => setNotice({ tone: "error", text: errorMessage(error) })}
      />

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            role="status"
            className={`fixed bottom-5 left-1/2 z-[60] w-[min(92vw,460px)] -translate-x-1/2 rounded-2xl px-5 py-3.5 text-sm font-bold shadow-2xl ${notice.tone === "success" ? "bg-ink text-white" : "bg-chonta text-white"}`}
          >
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, icon }: { active: boolean; onClick: () => void; label: string; count: number; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-bold transition ${active ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/10 hover:ring-ink/25"}`}
    >
      {icon}
      {label}
      <span className={`rounded-full px-1.5 font-display text-xs font-extrabold tabular-nums ${active ? "bg-brand text-ink" : "bg-ink/[0.06] text-ink/60"}`}>{count}</span>
    </button>
  );
}
