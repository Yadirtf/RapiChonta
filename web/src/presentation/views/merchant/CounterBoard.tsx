"use client";

import { AnimatePresence } from "framer-motion";
import { Bike, CookingPot, Inbox, PackageCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MERCHANT_POLL_MS, type CounterLane, type CounterOrder, type MerchantOptions, type MerchantStore } from "@/core/domain/entities/merchant";
import { container } from "@/infrastructure/di/container";
import { Alert } from "../../components/ui/Alert";
import type { useDispatchBell } from "../../hooks/useDispatchBell";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { usePolling, useServerClock } from "../../hooks/usePolling";
import { ClosedStrip } from "./ClosedStrip";
import { CounterTicket } from "./CounterTicket";
import { DeclineDialog } from "./DeclineDialog";

const LANES: {
  lane: Exclude<CounterLane, "CLOSED">;
  icon: typeof Inbox;
  tone: string;
}[] = [
  { lane: "INCOMING", icon: Inbox, tone: "bg-chonta text-white" },
  { lane: "PREPARING", icon: CookingPot, tone: "bg-brand text-ink" },
  { lane: "READY", icon: PackageCheck, tone: "bg-leaf text-white" },
];

/**
 * El mostrador (H15.1): las comandas colgadas en tres ganchos, como en la cocina. Las nuevas suenan y laten hasta
 * que se responden; las del fogón cuentan hacia la hora prometida; las listas esperan al domiciliario. Abajo, lo que
 * ya salió hoy. Se actualiza sola cada 5 s.
 */
export function CounterBoard({ store, options, bell }: { store: MerchantStore; options: MerchantOptions | null; bell: ReturnType<typeof useDispatchBell> }) {
  const t = useTranslations("merchant.counter");
  const errorMessage = useErrorMessage();
  const board = usePolling(() => container.merchant.counter(store.id), [store.id], MERCHANT_POLL_MS);
  const now = useServerClock(board.data?.serverTime);
  const orders = useMemo(() => board.data?.orders ?? [], [board.data]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [declining, setDeclining] = useState<CounterOrder | null>(null);

  // La campana: una vez por pedido nuevo.
  const { announce } = bell;
  useEffect(() => {
    announce(orders.filter((o) => o.lane === "INCOMING").map((o) => ({ key: `${store.id}:${o.code}`, chime: "new" as const })));
  }, [orders, announce, store.id]);

  const incoming = orders.filter((o) => o.lane === "INCOMING").length;
  useEffect(() => {
    const base = t("documentTitle", { store: store.name });
    document.title = incoming ? `(${incoming}) ${base}` : base;
    return () => {
      document.title = "RapiChonta";
    };
  }, [incoming, store.name, t]);

  const act = async (code: string, action: () => Promise<void>) => {
    setBusy(code);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
      await board.refresh();
    }
  };

  if (board.loading && !board.data) {
    return (
      <div className="grid gap-5 lg:grid-cols-3" aria-busy>
        {LANES.map(({ lane }) => (
          <div key={lane} className="h-72 animate-pulse rounded-[28px] bg-white/70" />
        ))}
      </div>
    );
  }

  const open = orders.filter((o) => o.lane !== "CLOSED");
  return (
    <div className="flex flex-col gap-6">
      {board.error && !board.data ? <Alert>{errorMessage(board.error)}</Alert> : null}
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      {store.status !== "ACTIVE" && <Alert tone="info">{t("pausedNotice")}</Alert>}

      {open.length === 0 ? (
        <EmptyCounter paused={store.status !== "ACTIVE"} />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {LANES.map(({ lane, icon, tone }) => {
            const list = orders.filter((o) => o.lane === lane);
            return (
              <Lane key={lane} title={t(`lanes.${lane}`)} hint={t(`hints.${lane}`)} count={list.length} icon={icon} tone={tone}>
                <AnimatePresence initial={false}>
                  {list.map((order) => (
                    <CounterTicket
                      key={order.code}
                      order={order}
                      now={now}
                      busy={busy === order.code}
                      limits={options?.preparationMinutes ?? { min: 1, max: 240 }}
                      onAccept={(minutes) => void act(order.code, () => container.merchant.accept(order.code, minutes))}
                      onDecline={() => setDeclining(order)}
                      onReady={() => void act(order.code, () => container.merchant.markReady(order.code))}
                    />
                  ))}
                </AnimatePresence>
                {!list.length && (
                  <p className="rounded-2xl border-2 border-dashed border-ink/10 px-4 py-6 text-center text-sm text-ink/45">{t(`empty.${lane}`)}</p>
                )}
              </Lane>
            );
          })}
        </div>
      )}

      <ClosedStrip orders={orders.filter((o) => o.lane === "CLOSED")} hours={options?.closedWindowHours ?? 12} />

      <DeclineDialog
        order={declining}
        reasons={options?.declineReasons ?? []}
        onClose={() => setDeclining(null)}
        onDecline={async (reason, notes) => {
          const code = declining!.code;
          setDeclining(null);
          await act(code, () => container.merchant.decline(code, { reason, notes }));
        }}
      />
    </div>
  );
}

function Lane({
  title,
  hint,
  count,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  icon: typeof Inbox;
  tone: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-6 rounded-[28px] bg-white/60 p-4 ring-1 ring-ink/5">
      {/* El riel: una barra de metal de la que cuelgan las comandas. */}
      <header className="flex items-center gap-3">
        <span className={`grid size-10 place-items-center rounded-2xl ${tone}`}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-extrabold leading-tight tracking-tight">{title}</h2>
          <p className="truncate text-xs text-ink/50">{hint}</p>
        </div>
        <span className="grid min-w-8 place-items-center rounded-full bg-ink px-2 py-1 text-xs font-extrabold tabular-nums text-white">{count}</span>
      </header>
      <div className="h-1.5 rounded-full bg-gradient-to-b from-[#d8d2c4] to-[#8d8677] shadow-sm" aria-hidden />
      <div className="-mt-2 flex flex-col gap-7">{children}</div>
    </section>
  );
}

function EmptyCounter({ paused }: { paused: boolean }) {
  const t = useTranslations("merchant.counter");
  return (
    <div className="chalkboard relative overflow-hidden rounded-[28px] px-6 py-14 text-center text-white">
      <Bike className="mx-auto size-10 text-brand" aria-hidden />
      <h2 className="mt-4 font-display text-2xl font-extrabold">{t(paused ? "emptyPausedTitle" : "emptyTitle")}</h2>
      <p className="mx-auto mt-2 max-w-md text-white/70">{t(paused ? "emptyPausedBody" : "emptyBody")}</p>
    </div>
  );
}
