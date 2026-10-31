"use client";

import { motion } from "framer-motion";
import { Clock3, KeyRound, MapPin, MessageSquareText, PackageSearch, PartyPopper, ReceiptText, ShieldCheck, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Link from "next/link";
import { createElement, useEffect, useRef, type ReactNode } from "react";
import { toCents } from "@/core/domain/entities/money";
import { addressPoint, openAdjustment, type OrderDetail } from "@/core/domain/entities/order";
import { container } from "@/infrastructure/di/container";
import { isApiError } from "@/infrastructure/http/api-client";
import { useAuth } from "../../auth/AuthProvider";
import { useCart } from "../../cart/CartProvider";
import { ApproxPrice } from "../../components/business/ApproxPrice";
import { DoorCard, StorePage } from "../../components/layout/StorePage";
import { AdjustmentChanges, AdjustmentDesk } from "../../components/orders/AdjustmentDesk";
import { OrderRoute } from "../../components/orders/OrderRoute";
import { PrepCountdown } from "../../components/orders/PrepClock";
import { paymentIcon } from "../../components/orders/orderVisuals";
import { DeliveryCodePass, LeftWithPhoto } from "../../components/orders/DeliveryClose";
import { IncidentCase } from "../../components/orders/IncidentCase";
import { HighDemandNote, ReceiptButton } from "../../components/orders/PurchaseReceipt";
import { StatusBadge } from "../../components/orders/StatusBadge";
import { useStatusText } from "../../components/orders/useStatusText";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { formatPhone } from "../../format";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { useResource } from "../../hooks/useResource";
import { StoreLogo } from "./MyOrdersView";
import { ORDER_TIME_ZONE, useOrderDate, useOrderTime } from "./useOrderDate";

const PlacePreviewMap = dynamic(() => import("../../components/map/PlacePreviewMap").then((m) => m.PlacePreviewMap), {
  ssr: false,
  loading: () => <div className="blueprint h-40 animate-pulse" />,
});

/** Mientras el pedido está activo, el estado se vuelve a pedir cada 15 s (si la pestaña está a la vista). */
const REFRESH_MS = 15_000;
/** En el local la pregunta del domiciliario puede llegar en cualquier momento y tiene 3 minutos: más seguido. */
const AT_STORE_REFRESH_MS = 4_000;
const AT_STORE = new Set(["AT_ESTABLISHMENT", "AWAITING_CUSTOMER"]);

/** H04.4 / RF-50: el pedido con su código, la ruta de estados y la comanda. Sin ubicación del domiciliario. */
export function OrderDetailView({ code, placed }: { code: string; placed: boolean }) {
  const t = useTranslations("orders");
  const { status, requestSignIn } = useAuth();
  return (
    <StorePage back="/pedidos" backLabel={t("toOrders")} title={t("detailTitle")} width="max-w-5xl">
      {status === "loading" ? (
        <DetailSkeleton />
      ) : status === "anonymous" ? (
        <DoorCard icon={<KeyRound className="size-8" aria-hidden />} title={t("signInTitle")} body={t("signInBody")}>
          <Button size="lg" onClick={() => void requestSignIn()}>
            {t("signIn")}
          </Button>
        </DoorCard>
      ) : (
        <Detail code={code} placed={placed} />
      )}
    </StorePage>
  );
}

function Detail({ code, placed }: { code: string; placed: boolean }) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const { cart, replace } = useCart();
  const { data: order, error, loading, reload } = useResource(() => container.orders.find(code, locale), [code, locale]);
  const time = useOrderTime();
  const celebrated = useRef(false);

  // El pedido ya existe: la canasta de ese local se vacía y la URL deja de decir "nuevo" (al recargar no se repite la fiesta).
  useEffect(() => {
    if (!order || !placed || celebrated.current) return;
    celebrated.current = true;
    if (cart?.establishmentId === order.establishment.id) replace(null);
    window.history.replaceState(null, "", `/pedidos/${order.code}`);
  }, [order, placed, cart, replace]);

  const active = !!order?.active;
  const every = order && AT_STORE.has(order.status) ? AT_STORE_REFRESH_MS : REFRESH_MS;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => document.visibilityState === "visible" && void reload(), every);
    return () => window.clearInterval(timer);
  }, [active, every, reload]);

  if (loading && !order) return <DetailSkeleton />;
  if (!order) {
    if (isApiError(error, "ORDER_NOT_FOUND") || isApiError(error, "NOT_FOUND")) {
      return (
        <DoorCard icon={<PackageSearch className="size-8" aria-hidden />} title={t("notFoundTitle")} body={t("notFoundBody")}>
          <Link href="/pedidos" className="inline-flex h-12 items-center justify-center rounded-2xl bg-brand px-6 font-bold">
            {t("toOrders")}
          </Link>
        </DoorCard>
      );
    }
    return <Alert className="mt-8">{errorMessage(error)}</Alert>;
  }

  const question = order.status === "AWAITING_CUSTOMER" ? openAdjustment(order) : null;
  return (
    <div className="mt-6 flex flex-col gap-6 pb-16">
      {placed && <PlacedBanner code={order.code} />}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <StatusTicket order={order} />
          {question && <AdjustmentDesk key={question.id} order={order} adjustment={question} onChanged={() => void reload()} />}
          {order.active && <DeliveryCodePass order={order} onClosed={() => void reload()} />}
          {order.status === "PENDING_REVIEW" && <LeftWithPhoto order={order} time={time} onClosed={() => void reload()} />}
          {order.incident && <IncidentCase order={order} incident={order.incident} time={time} />}
          {order.status === "PREPARING" && order.preparation?.delayed && <HighDemandNote store={order.establishment.name} />}
          <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_32px_-20px_rgb(20_18_31/0.35)] sm:p-6" aria-labelledby="route-title">
            <h2 id="route-title" className="mb-5 font-display text-xl font-extrabold">
              {t("route")}
            </h2>
            <OrderRoute order={order} timeZone={ORDER_TIME_ZONE} />
            <p className="mt-5 flex items-start gap-2 rounded-2xl bg-cream px-3.5 py-3 text-xs text-ink/65">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-leaf" aria-hidden /> {t("privacy")}
            </p>
          </section>
        </div>
        <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
          <OrderReceipt order={order} />
          {order.purchase && <PurchaseCard order={order} purchase={order.purchase} />}
          <DeliveryCard order={order} />
        </aside>
      </div>
    </div>
  );
}

/** El momento de "¡listo!": el tiquete con el código cae sobre la página. */
function PlacedBanner({ code }: { code: string }) {
  const t = useTranslations("orders");
  return (
    <motion.div
      initial={{ opacity: 0, y: -16, rotate: -1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className="relative overflow-hidden rounded-[28px] bg-brand p-5 text-ink sm:p-6"
      role="status"
    >
      <PartyPopper className="pointer-events-none absolute -right-4 -top-4 size-32 rotate-12 text-chonta/15" aria-hidden />
      <p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t("placedTitle")}</p>
      <p className="mt-1 text-sm font-medium text-ink/70">{t("placedBody")}</p>
      <p className="mt-4 inline-flex items-center gap-3 rounded-2xl bg-ink px-4 py-2 text-white">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">{t("code")}</span>
        <span className="font-mono text-xl font-extrabold tracking-[0.12em] text-brand">{code}</span>
      </p>
    </motion.div>
  );
}

function StatusTicket({ order }: { order: OrderDetail }) {
  const t = useTranslations("orders");
  const text = useStatusText(order.fulfillmentMode);
  const body = text(order.status, "body");
  const when = useOrderDate();
  const time = useOrderTime();
  return (
    <section className="ticket rounded-[26px] text-white [--notch-y:70%]">
      <div className="p-5 pb-6 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <StoreLogo url={order.establishment.logoUrl} dark />
            <div className="min-w-0">
              <Link href={`/local/${order.establishment.id}`} className="block truncate font-display text-lg font-extrabold hover:underline">
                {order.establishment.name}
              </Link>
              <p className="text-xs text-white/55">{when(order.createdAt)}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-white/10 px-2 py-1 font-mono text-sm font-bold tracking-wider text-brand">{order.code}</span>
        </div>
        <div className="mt-5">
          <StatusBadge status={order.status} mode={order.fulfillmentMode} className="!px-3 !py-1.5 !text-sm" />
          {body && <p className="mt-2.5 text-[15px] text-white/80">{body}</p>}
          {order.status === "CANCELLED" && order.cancellationReason && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">{t("cancelledBecause")}</span>
              <span className="font-semibold text-brand">
                {t.has(`cancelReasons.${order.cancellationReason}`) ? t(`cancelReasons.${order.cancellationReason}`) : order.cancellationReason}
              </span>
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t-2 border-dashed border-white/15 px-5 py-3 text-xs text-white/55 sm:px-6">
        {order.active ? (
          <span className="flex items-center gap-2">
            <span className="route-current size-2 rounded-full bg-brand" aria-hidden /> {t("updated")}
          </span>
        ) : (
          <span>{t("items", { count: order.itemCount })}</span>
        )}
        {order.merchant && order.active && !order.merchant.readyAt && ["PENDING_ASSIGNMENT", "ACCEPTED", "AT_ESTABLISHMENT"].includes(order.status) ? (
          // Pedido directo (E15): la hora que prometió el comercio al aceptarlo.
          <span className="flex items-center gap-1">
            <Clock3 className="size-3.5" aria-hidden /> {t("merchantReadyAround", { store: order.establishment.name, time: time(order.merchant.estimatedReadyAt) })}
          </span>
        ) : order.merchant?.readyAt && order.active && order.status !== "ON_THE_WAY" && order.status !== "ARRIVING" ? (
          <span className="flex items-center gap-1 font-semibold text-brand">{t("merchantReady", { store: order.establishment.name })}</span>
        ) : order.status === "PREPARING" && order.preparation ? (
          <span className="flex items-center gap-3">
            <PrepCountdown preparation={order.preparation} />
            <span className="hidden text-white/45 sm:inline">{t("readyAround", { time: time(order.preparation.estimatedReadyAt) })}</span>
          </span>
        ) : (
          order.prepMinutes > 0 &&
          order.active && (
            <span className="flex items-center gap-1">
              <Clock3 className="size-3.5" aria-hidden /> {t("prep", { minutes: order.prepMinutes })}
            </span>
          )
        )}
      </div>
    </section>
  );
}

function OrderReceipt({ order }: { order: OrderDetail }) {
  const t = useTranslations("orders");
  const money = useCatalogFormat();
  return (
    <section className="receipt-edge mt-2.5 rounded-b-[28px] bg-white px-5 pb-5 pt-4 shadow-[0_18px_40px_-24px_rgb(20_18_31/0.45)]" aria-labelledby="receipt-title">
      <h2 id="receipt-title" className="border-b-2 border-dashed border-ink/15 pb-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-chonta">
        {t("receipt")}
      </h2>
      <ul className="flex flex-col divide-y divide-dashed divide-ink/10">
        {order.lines.map((line) => (
          <li key={line.productId} className="py-2.5 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="w-7 shrink-0 font-display font-extrabold tabular-nums text-chonta">{line.quantity}×</span>
              <span className="min-w-0 flex-1 font-semibold">{line.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{money.price(line.subtotal)}</span>
            </div>
            {line.notes && <p className="pl-9 text-xs italic text-ink/60">{line.notes}</p>}
          </li>
        ))}
      </ul>
      <AdjustmentChanges adjustments={order.adjustments} />
      <dl className="mt-1 flex flex-col gap-1.5 border-t-2 border-dashed border-ink/15 pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink/60">{t("products")}</dt>
          <dd className="font-semibold tabular-nums">{money.price(order.itemsTotal)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="min-w-0 truncate text-ink/60">{t("delivery", { zone: order.zone.name })}</dt>
          <dd className="font-semibold tabular-nums">{money.price(order.deliveryFee)}</dd>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <dt className="font-bold">{t("total")}</dt>
          <dd className="flex flex-col items-end">
            <span className="font-display text-3xl font-extrabold tabular-nums tracking-tight">{money.price(order.total)}</span>
            <ApproxPrice cents={toCents(order.total)} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** H08.4: lo que pagó el domiciliario en el local, con la factura. El cliente paga lo del recibo de arriba. */
function PurchaseCard({ order, purchase }: { order: OrderDetail; purchase: NonNullable<OrderDetail["purchase"]> }) {
  const t = useTranslations("orders");
  const money = useCatalogFormat();
  return (
    <section className="flex items-center gap-3 rounded-[28px] bg-white p-4 shadow-[0_12px_32px_-20px_rgb(20_18_31/0.35)]">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-chonta" aria-hidden>
        <ReceiptText className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display font-extrabold">{t("purchaseTitle")}</p>
        <p className="text-sm text-ink/65">{t("purchaseBody", { amount: money.price(purchase.amount) })}</p>
      </div>
      {purchase.receiptUrl && <ReceiptButton url={purchase.receiptUrl} code={order.code} />}
    </section>
  );
}

function DeliveryCard({ order }: { order: OrderDetail }) {
  const t = useTranslations("orders");
  const tp = useTranslations("payment");
  return (
    <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_32px_-20px_rgb(20_18_31/0.35)]">
      <PlacePreviewMap point={addressPoint(order.address)} className="h-40" />
      <dl className="flex flex-col divide-y divide-dashed divide-ink/10 px-5">
        <Row icon={<MapPin className="size-4" />} term={t("deliverTo")}>
          {order.address.label && <span className="block font-bold">{order.address.label}</span>}
          {order.address.reference && <span className="block">{order.address.reference}</span>}
          {order.address.line && <span className="block text-ink/55">{order.address.line}</span>}
        </Row>
        <Row icon={<UserRound className="size-4" />} term={t("receivedBy")}>
          {order.recipient ? (
            <>
              <span className="block font-bold">{order.recipient.fullName}</span>
              {order.recipient.phone && <span className="block tabular-nums text-ink/55">{formatPhone(order.recipient.phone)}</span>}
            </>
          ) : (
            <span className="font-bold">{t("you")}</span>
          )}
        </Row>
        <Row icon={createElement(paymentIcon(order.paymentMethod), { className: "size-4" })} term={t("payWith")}>
          <span className="font-bold">{tp.has(order.paymentMethod) ? tp(order.paymentMethod) : order.paymentMethod}</span>
        </Row>
        {order.notes && (
          <Row icon={<MessageSquareText className="size-4" />} term={t("notes")}>
            <span className="whitespace-pre-line">{order.notes}</span>
          </Row>
        )}
      </dl>
    </section>
  );
}

function Row({ icon, term, children }: { icon: ReactNode; term: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-3.5 text-sm">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-cream text-chonta" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wider text-ink/45">{term}</dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy>
      <div className="flex flex-col gap-6">
        <div className="h-48 animate-pulse rounded-[26px] bg-ink/10" />
        <div className="h-96 animate-pulse rounded-[28px] bg-white" />
      </div>
      <div className="h-80 animate-pulse rounded-[28px] bg-white" />
    </div>
  );
}
