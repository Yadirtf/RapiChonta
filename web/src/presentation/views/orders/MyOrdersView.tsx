"use client";

import { Bike, ChevronRight, KeyRound, ReceiptText, Store } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { journeyProgress, type OrderStatusCode, type OrderSummary } from "@/core/domain/entities/order";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../auth/AuthProvider";
import { DoorCard, StorePage } from "../../components/layout/StorePage";
import { StatusBadge } from "../../components/orders/StatusBadge";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { useResource } from "../../hooks/useResource";
import { useOrderDate } from "./useOrderDate";

/** Los activos se refrescan solos mientras la pantalla está abierta. */
const ACTIVE_REFRESH_MS = 30_000;

/** H04.4: Mis pedidos. Los que van en curso como tiquetes de comanda; el historial como recibos. */
export function MyOrdersView() {
  const t = useTranslations("orders");
  const { status, requestSignIn } = useAuth();

  return (
    <StorePage back="/" backLabel={t("backToMap")} title={t("title")} width="max-w-3xl">
      {status === "loading" ? (
        <ListSkeleton />
      ) : status === "anonymous" ? (
        <DoorCard icon={<KeyRound className="size-8" aria-hidden />} title={t("signInTitle")} body={t("signInBody")}>
          <Button size="lg" onClick={() => void requestSignIn()}>
            {t("signIn")}
          </Button>
        </DoorCard>
      ) : (
        <OrdersList />
      )}
    </StorePage>
  );
}

function OrdersList() {
  const t = useTranslations("orders");
  const errorMessage = useErrorMessage();
  const first = useResource(() => container.orders.mine(), []);
  const [older, setOlder] = useState<OrderSummary[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const hasActive = !!first.data?.active.length;
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => void first.reload(), ACTIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [hasActive, first.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (first.loading && !first.data) return <ListSkeleton />;
  if (first.error && !first.data) {
    return (
      <Alert className="mt-8">
        <p className="font-bold">{t("loadError")}</p>
        <p>{errorMessage(first.error)}</p>
        <button type="button" onClick={() => void first.reload()} className="mt-1 font-bold underline">
          {t("retry")}
        </button>
      </Alert>
    );
  }
  const page = first.data!;
  const next = cursor === undefined ? page.nextBefore : cursor;
  const past = [...page.past, ...older];

  const more = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const result = await container.orders.mine(next);
      setOlder((o) => [...o, ...result.past]);
      setCursor(result.nextBefore);
    } finally {
      setLoadingMore(false);
    }
  };

  if (!page.active.length && !past.length) {
    return (
      <DoorCard icon={<Bike className="size-8" aria-hidden />} title={t("emptyTitle")} body={t("emptyBody")}>
        <Link href="/" className="inline-flex h-12 items-center justify-center rounded-2xl bg-brand px-6 font-bold">
          {t("toMap")}
        </Link>
      </DoorCard>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-10 pb-16">
      {page.active.length > 0 && (
        <section aria-labelledby="active-orders">
          <h2 id="active-orders" className="mb-3 flex items-center gap-2 font-display text-lg font-extrabold">
            <span className="route-current size-2.5 rounded-full bg-brand" aria-hidden /> {t("active")}
          </h2>
          <div className="flex flex-col gap-4">
            {page.active.map((order, i) => (
              <motion.div key={order.code} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <ActiveTicket order={order} journey={page.journey} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="past-orders">
        <h2 id="past-orders" className="mb-3 flex items-center gap-2 font-display text-lg font-extrabold">
          <ReceiptText className="size-5 text-chonta" aria-hidden /> {t("history")}
        </h2>
        {past.length === 0 ? (
          <p className="rounded-3xl border-2 border-dashed border-ink/10 px-5 py-8 text-center text-sm text-ink/55">{t("emptyHistory")}</p>
        ) : (
          <ul className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_32px_-20px_rgb(20_18_31/0.35)]">
            {past.map((order) => (
              <PastRow key={order.code} order={order} />
            ))}
          </ul>
        )}
        {next && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" loading={loadingMore} onClick={() => void more()}>
              {t("more")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

/** Tiquete de un pedido en curso: la comanda desprendible con su código y la moto avanzando por la ruta. */
function ActiveTicket({ order, journey }: { order: OrderSummary; journey: OrderStatusCode[] }) {
  const t = useTranslations("orders");
  const money = useCatalogFormat();
  const when = useOrderDate();
  const progress = journeyProgress(order.status, journey);

  return (
    <Link
      href={`/pedidos/${order.code}`}
      className="ticket group block rounded-[26px] text-white outline-none transition hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-brand/50 [--notch-y:62%]"
    >
      <div className="p-5 pb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <StoreLogo url={order.establishment.logoUrl} dark />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-extrabold">{order.establishment.name}</p>
              <p className="text-xs text-white/55">{when(order.createdAt)}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-white/10 px-2 py-1 font-mono text-sm font-bold tracking-wider text-brand">{order.code}</span>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <StatusBadge status={order.status} />
        </div>
        <div className="relative mt-4 h-2 rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(4, progress * 100)}%` }} />
          <span
            className="absolute top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand text-ink shadow-[0_0_0_4px_var(--color-ink)] transition-[left] duration-700"
            style={{ left: `${Math.max(4, progress * 100)}%` }}
          >
            <Bike className="size-4" strokeWidth={2.5} />
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t-2 border-dashed border-white/15 px-5 py-3.5 text-sm">
        <span className="text-white/60">{t("items", { count: order.itemCount })}</span>
        <span className="flex items-center gap-1 font-display text-lg font-extrabold tabular-nums">
          {money.price(order.total)} <ChevronRight className="size-5 text-brand transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

function PastRow({ order }: { order: OrderSummary }) {
  const t = useTranslations("orders");
  const money = useCatalogFormat();
  const when = useOrderDate();
  return (
    <li className="border-b border-dashed border-ink/10 last:border-0">
      <Link href={`/pedidos/${order.code}`} className="flex items-center gap-3 px-4 py-3.5 outline-none transition hover:bg-cream/60 focus-visible:bg-cream sm:px-5">
        <StoreLogo url={order.establishment.logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{order.establishment.name}</p>
          <p className="truncate text-xs text-ink/55">
            {when(order.createdAt)} · {t("items", { count: order.itemCount })} · <span className="font-mono">{order.code}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-display font-extrabold tabular-nums">{money.price(order.total)}</span>
          <StatusBadge status={order.status} className="!px-2 !py-0.5 !text-[11px]" />
        </div>
      </Link>
    </li>
  );
}

export function StoreLogo({ url, dark = false }: { url: string | null; dark?: boolean }) {
  return (
    <span className={`grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl ${dark ? "bg-brand text-ink" : "bg-cream text-chonta"}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <Store className="size-5" aria-hidden />
      )}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-8 flex flex-col gap-4" aria-busy>
      <div className="h-44 animate-pulse rounded-[26px] bg-ink/10" />
      <div className="h-56 animate-pulse rounded-[28px] bg-white" />
    </div>
  );
}
