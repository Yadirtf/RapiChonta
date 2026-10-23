"use client";

import { Ban, Camera, CheckCircle2, FileSearch, HandCoins, Loader2, MapPin, MapPinCheck, MessageSquareText, Phone, SearchCheck, UserRound, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { createElement, useState, type ReactNode } from "react";
import { can, fullName, PERMISSIONS } from "@/core/domain/entities/account";
import {
  collectionGap,
  DESK_POLL_MS,
  proofDistanceTone,
  type DeskIncident,
  type DeskOrderDetail,
  type ProofOutcome,
} from "@/core/domain/entities/desk";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../../auth/AuthProvider";
import { paymentIcon } from "../../../components/orders/orderVisuals";
import { ReceiptButton } from "../../../components/orders/PurchaseReceipt";
import { StatusBadge } from "../../../components/orders/StatusBadge";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { formatPhone } from "../../../format";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { usePolling } from "../../../hooks/usePolling";
import { useOrderTime } from "../../orders/useOrderDate";
import { DeskActionDialog, type DeskAction } from "./DeskActionDialog";
import { DeskTimeline } from "./DeskTimeline";
import { ALERT_LOOK } from "./deskVisuals";

const DISTANCE_TONES = {
  near: "bg-leaf text-white",
  block: "bg-brand text-ink",
  far: "bg-chonta text-white",
  unknown: "bg-ink/10 text-ink/70",
} as const;

/**
 * El expediente del pedido (H10.5): quién lo pidió y quién lo lleva, lo que hay que decidir (la novedad, la foto de
 * entrega, cancelar), el cobro contra lo que debía y la línea de tiempo completa. Se refresca con el tablero.
 */
export function DeskOrderSheet({
  code,
  now,
  onClose,
  onDone,
  onFailed,
}: {
  code: string | null;
  now: number;
  onClose: () => void;
  onDone: (text: string) => void;
  onFailed: (error: unknown) => void;
}) {
  const t = useTranslations("desk");
  const errorMessage = useErrorMessage();
  const detail = usePolling(() => (code ? container.desk.detail(code) : Promise.resolve(null)), [code], DESK_POLL_MS);
  const order = detail.data;
  const [action, setAction] = useState<DeskAction | null>(null);

  return (
    <Dialog open={!!code} onClose={onClose} side size="lg" closeLabel={t("close")} title={code ?? ""} description={order ? `${order.establishment.name} → ${order.zoneName}` : undefined}>
      {!order ? (
        detail.error ? (
          <Alert>{errorMessage(detail.error)}</Alert>
        ) : (
          <div className="grid min-h-60 place-items-center" aria-busy>
            <Loader2 className="size-6 animate-spin text-ink/40" aria-hidden />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-6">
          <Parties order={order} />
          <AlertList order={order} />
          {order.incident && <IncidentFile order={order} incident={order.incident} onAction={setAction} onDone={onDone} onFailed={onFailed} refresh={detail.refresh} />}
          {order.proof && <ProofPhoto order={order} onAction={setAction} />}
          <Collection order={order} />
          {order.cancellation && <CancellationNote order={order} />}
          <Lines order={order} />
          <section aria-labelledby="timeline-title">
            <h3 id="timeline-title" className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-chonta">
              {t("timelineTitle")}
            </h3>
            <DeskTimeline events={order.timeline} now={now} />
          </section>
          {order.cancellable && <CancelStrip onCancel={() => setAction({ kind: "cancel" })} />}
        </div>
      )}
      {order && (
        <DeskActionDialog
          order={order}
          action={action}
          onClose={() => setAction(null)}
          onDone={(text) => {
            setAction(null);
            onDone(text);
            void detail.refresh();
          }}
        />
      )}
    </Dialog>
  );
}

/** El tiquete oscuro de arriba: estado, total y las dos personas con su teléfono a un toque. */
function Parties({ order }: { order: DeskOrderDetail }) {
  const t = useTranslations("desk");
  const tp = useTranslations("payment");
  const { price } = useCatalogFormat();
  return (
    <section className="ticket rounded-[24px] text-white [--notch-y:62%]">
      <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
        <StatusBadge status={order.status} className="!px-3 !py-1.5 !text-sm" />
        <span className="text-right">
          <span className="block font-display text-2xl font-extrabold tabular-nums text-brand">{price(order.amounts.total)}</span>
          <span className="flex items-center justify-end gap-1 text-xs text-white/60">
            {createElement(paymentIcon(order.paymentMethod), { className: "size-3.5", "aria-hidden": true })}
            {tp.has(order.paymentMethod) ? tp(order.paymentMethod) : order.paymentMethod}
          </span>
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t-2 border-dashed border-white/15">
        <Person term={t("customer")} name={fullName(order.customer)} phone={order.customer.phone} />
        <Person
          term={t("courier")}
          name={order.courier ? fullName(order.courier) : t("noCourier")}
          phone={order.courier?.phone ?? null}
          note={order.courier && !order.courier.holding ? t("courierLeft") : null}
        />
      </dl>
    </section>
  );
}

function Person({ term, name, phone, note }: { term: string; name: string; phone: string | null; note?: string | null }) {
  return (
    <div className="min-w-0 px-5 py-3.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{term}</dt>
      <dd className="mt-0.5 truncate font-bold">{name}</dd>
      {phone && (
        <dd>
          <a href={`tel:${phone}`} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold tabular-nums text-brand hover:bg-white/15">
            <Phone className="size-3.5" aria-hidden /> {formatPhone(phone)}
          </a>
        </dd>
      )}
      {note && <dd className="mt-1 text-[11px] text-white/50">{note}</dd>}
    </div>
  );
}

/** Por qué está en el tablero: cada alerta con su frase de qué hacer. */
function AlertList({ order }: { order: DeskOrderDetail }) {
  const t = useTranslations("desk");
  const time = useOrderTime();
  // La novedad y la foto tienen su propia sección con las acciones: aquí solo lo demás.
  const alerts = order.alerts.filter((a) => !(a.code === "INCIDENT" && order.incident) && !(a.code === "PROOF_REVIEW" && order.proof));
  if (!alerts.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert) => {
        const look = ALERT_LOOK[alert.code];
        return (
          <li key={alert.code} className="flex items-start gap-3 rounded-2xl bg-white p-3 ring-1 ring-ink/10">
            <span className={`grid size-9 shrink-0 -rotate-6 place-items-center rounded-xl ${look.chip}`} aria-hidden>
              <look.icon className="size-4" />
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-extrabold">{t(`alerts.${alert.code}.short`)}</span>
              <span className="block text-ink/65">{t(`alerts.${alert.code}.body`)}</span>
              <span className="mt-0.5 block text-[11px] font-semibold tabular-nums text-ink/45">{t("since", { time: time(alert.since) })}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** La novedad en su carpeta: lo que contó quien la abrió, quién la tiene y las dos acciones. */
function IncidentFile({
  order,
  incident,
  onAction,
  onDone,
  onFailed,
  refresh,
}: {
  order: DeskOrderDetail;
  incident: DeskIncident;
  onAction: (action: DeskAction) => void;
  onDone: (text: string) => void;
  onFailed: (error: unknown) => void;
  refresh: () => Promise<void>;
}) {
  const t = useTranslations("desk");
  const { account } = useAuth();
  const time = useOrderTime();
  const [taking, setTaking] = useState(false);
  const canResolve = can(account, PERMISSIONS.RESOLVE_INCIDENTS);

  const take = async () => {
    setTaking(true);
    try {
      await container.desk.takeIncident(incident.id);
      onDone(t("takenNotice", { code: order.code }));
      await refresh();
    } catch (error) {
      onFailed(error);
      await refresh();
    } finally {
      setTaking(false);
    }
  };

  return (
    <section className="case-file p-5" data-tab={t(`incidentTypes.${incident.type}`)} aria-labelledby="incident-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 -rotate-6 place-items-center rounded-xl bg-chonta text-white" aria-hidden>
          <FileSearch className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 id="incident-title" className="font-display text-lg font-extrabold leading-tight">
            {incident.reportedByRole === "CUSTOMER" ? t("incidentByCustomer", { name: order.customer.givenNames.split(" ")[0] }) : t("incidentByStaff")}
          </h3>
          <p className="text-xs font-semibold tabular-nums text-ink/50">{t("since", { time: time(incident.createdAt) })}</p>
        </div>
      </div>
      {incident.description && <blockquote className="mt-4 rounded-2xl bg-white/80 px-4 py-3 text-[15px] italic text-ink/80 ring-1 ring-ink/10">“{incident.description}”</blockquote>}
      <p className="mt-4 flex items-center gap-2 text-sm font-bold">
        {incident.takenBy ? (
          <>
            <UserRound className="size-4 text-leaf" aria-hidden /> {t("takenByFull", { name: fullName(incident.takenBy) })}
          </>
        ) : (
          <>
            <span className="route-current size-2 rounded-full bg-chonta" aria-hidden /> {t("nobodyYet")}
          </>
        )}
      </p>
      {canResolve && (
        <div className="mt-4 flex flex-wrap gap-2 border-t-2 border-dashed border-ink/15 pt-4">
          {incident.status === "OPEN" && (
            <Button variant="outline" loading={taking} onClick={() => void take()}>
              <SearchCheck className="size-4 text-chonta" aria-hidden /> {t("take")}
            </Button>
          )}
          <Button variant="dark" onClick={() => onAction({ kind: "resolve", incident })}>
            <CheckCircle2 className="size-4 text-brand" aria-hidden /> {t("resolve")}
          </Button>
        </div>
      )}
    </section>
  );
}

/** La foto de entrega como polaroid, con a cuántos metros del punto se tomó; si está por revisar, la decisión. */
function ProofPhoto({ order, onAction }: { order: DeskOrderDetail; onAction: (action: DeskAction) => void }) {
  const t = useTranslations("desk");
  const { account } = useAuth();
  const { distance } = useCatalogFormat();
  const time = useOrderTime();
  const proof = order.proof!;
  const tone = proofDistanceTone(proof.distanceMeters);
  const reviewing = order.status === "PENDING_REVIEW" && !order.incident && can(account, PERMISSIONS.REVIEW_DELIVERIES);
  const outcomes: { outcome: ProofOutcome; icon: ReactNode; variant: "primary" | "outline" | "ghost" }[] = [
    { outcome: "DELIVERED", icon: <CheckCircle2 className="size-4" aria-hidden />, variant: "primary" },
    { outcome: "INVESTIGATE", icon: <FileSearch className="size-4 text-chonta" aria-hidden />, variant: "outline" },
    { outcome: "CANCELLED", icon: <XCircle className="size-4 text-chonta" aria-hidden />, variant: "ghost" },
  ];

  return (
    <section aria-labelledby="proof-title">
      <h3 id="proof-title" className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-chonta">
        <Camera className="size-4" aria-hidden /> {t("proofTitle")}
      </h3>
      <figure className="mx-auto w-full max-w-sm -rotate-[1.2deg] rounded-md bg-white p-3 pb-4 shadow-[0_18px_34px_-18px_rgb(20_18_31/0.55)] ring-1 ring-ink/10">
        {proof.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada que vence: no pasa por el optimizador
          <img src={proof.url} alt={t("proofAlt", { code: order.code })} className="aspect-[4/5] w-full rounded-sm bg-cream object-cover" />
        ) : (
          <div className="grid aspect-[4/5] w-full place-items-center rounded-sm bg-cream text-ink/30">
            <Camera className="size-10" aria-hidden />
          </div>
        )}
        <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${DISTANCE_TONES[tone]}`}>
            {tone === "unknown" ? <MapPin className="size-3.5" aria-hidden /> : <MapPinCheck className="size-3.5" aria-hidden />}
            {proof.distanceMeters === null ? t("proofNoLocation") : t(`proofDistance.${tone}`, { distance: distance(proof.distanceMeters) })}
          </span>
          {proof.capturedAt && <span className="font-display text-xs font-extrabold tabular-nums text-ink/55">{time(proof.capturedAt)}</span>}
        </figcaption>
      </figure>
      {reviewing && (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {outcomes.map(({ outcome, icon, variant }) => (
            <Button key={outcome} variant={variant} onClick={() => onAction({ kind: "proof", outcome })} className="sm:flex-1">
              {icon} {t(`proofOutcomes.${outcome}.button`)}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

/** El cobro contra entrega frente a lo que debía: lo que el domiciliario dijo que recibió y por qué medio. */
function Collection({ order }: { order: DeskOrderDetail }) {
  const t = useTranslations("desk");
  const tp = useTranslations("payment");
  const money = useCatalogFormat();
  const time = useOrderTime();
  const gap = collectionGap(order);
  const delivered = order.status === "DELIVERED";
  if (!order.collection && !delivered) return null;

  return (
    <section className="receipt-edge mt-2 rounded-b-[24px] bg-white px-5 pb-5 pt-4 shadow-[0_14px_30px_-22px_rgb(20_18_31/0.45)] ring-1 ring-ink/5" aria-labelledby="collection-title">
      <h3 id="collection-title" className="flex items-center gap-2 border-b-2 border-dashed border-ink/15 pb-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-leaf">
        <HandCoins className="size-4" aria-hidden /> {t("collectionTitle")}
      </h3>
      {!order.collection ? (
        <p className="pt-3 text-sm font-semibold text-ink/70">{t("collectionMissing")}</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-dashed divide-ink/10">
            {order.collection.payments.map((p, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-cream text-leaf" aria-hidden>
                  {createElement(paymentIcon(p.paymentMethod), { className: "size-4" })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{tp.has(p.paymentMethod) ? tp(p.paymentMethod) : p.paymentMethod}</span>
                  <span className="block text-[11px] tabular-nums text-ink/45">{time(p.at)}</span>
                </span>
                <span className="font-semibold tabular-nums">{money.price(p.amount)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-1 flex flex-col gap-1 border-t-2 border-dashed border-ink/15 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink/60">{t("collectionDue")}</dt>
              <dd className="font-semibold tabular-nums">{money.price(order.amounts.total)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-bold">{t("collectionGot")}</dt>
              <dd className="font-display text-2xl font-extrabold tabular-nums">{money.price(order.collection.total)}</dd>
            </div>
          </dl>
          {gap !== null && gap !== 0 && (
            <p className="mt-3 rounded-xl bg-chonta-soft px-3 py-2 text-sm font-bold text-chonta-strong" role="status">
              {gap < 0 ? t("collectionShort", { amount: money.cents(-gap) }) : t("collectionOver", { amount: money.cents(gap) })}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function CancellationNote({ order }: { order: DeskOrderDetail }) {
  const t = useTranslations("desk");
  const to = useTranslations("orders");
  const reason = order.cancellation!.reason;
  return (
    <p className="flex items-start gap-3 rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm">
      <Ban className="mt-0.5 size-4 shrink-0 text-ink/50" aria-hidden />
      <span>
        <span className="font-bold">{t("cancelledFor", { reason: to.has(`cancelReasons.${reason}`) ? to(`cancelReasons.${reason}`) : reason })}</span>
        {order.cancellation!.notes && <span className="block text-ink/65">“{order.cancellation!.notes}”</span>}
      </span>
    </p>
  );
}

/** La comanda: lo que se pidió (lo quitado por E09, tachado), la compra con su factura y las notas del cliente. */
function Lines({ order }: { order: DeskOrderDetail }) {
  const t = useTranslations("desk");
  const money = useCatalogFormat();
  return (
    <details className="group rounded-2xl bg-cream/70 px-4 py-3 ring-1 ring-ink/5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold">
        <span>{t("linesTitle", { count: order.lines.filter((l) => !l.removed).length })}</span>
        <span className="text-xs font-semibold text-ink/50 group-open:hidden">{t("show")}</span>
      </summary>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
        {order.lines.map((line, i) => (
          <li key={i} className={`flex items-baseline gap-2 ${line.removed ? "text-ink/40 line-through" : ""}`}>
            <span className="w-7 shrink-0 font-display font-extrabold tabular-nums text-chonta">{line.quantity}×</span>
            <span className="min-w-0 flex-1">{line.name}</span>
            <span className="tabular-nums">{money.price(line.unitPrice)}</span>
          </li>
        ))}
      </ul>
      {order.purchase && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t-2 border-dashed border-ink/10 pt-3 text-sm">
          <span className="text-ink/65">{t("paidAtStore", { amount: money.price(order.purchase.amount) })}</span>
          {order.purchase.receiptUrl && <ReceiptButton url={order.purchase.receiptUrl} code={order.code} />}
        </div>
      )}
      {(order.delivery.reference || order.notes) && (
        <div className="mt-3 flex flex-col gap-1.5 border-t-2 border-dashed border-ink/10 pt-3 text-sm text-ink/70">
          {order.delivery.reference && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-chonta" aria-hidden /> {order.delivery.reference}
            </p>
          )}
          {order.notes && (
            <p className="flex items-start gap-2">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-ink/45" aria-hidden /> {order.notes}
            </p>
          )}
        </div>
      )}
    </details>
  );
}

function CancelStrip({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations("desk");
  const { account } = useAuth();
  if (!can(account, PERMISSIONS.CANCEL_ORDERS)) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-chonta/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink/65">{t("cancelHint")}</p>
      <Button variant="outline" onClick={onCancel} className="shrink-0 !border-chonta/40 !text-chonta-strong">
        <Ban className="size-4" aria-hidden /> {t("cancelOrder")}
      </Button>
    </div>
  );
}
