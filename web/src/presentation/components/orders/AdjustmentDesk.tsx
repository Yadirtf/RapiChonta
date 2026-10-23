"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, BadgeCheck, CircleSlash2, Hourglass, PackageX, ShoppingBasket, Tag, Trash2, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  decisionDeltaCents,
  type AdjustmentDecision,
  type OrderAdjustment,
  type OrderAdjustmentLine,
  type OrderDetail,
  type SubstituteOption,
} from "@/core/domain/entities/order";
import { container } from "@/infrastructure/di/container";
import { mmss, useCountdown } from "../../hooks/useCountdown";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

/** Menos que esto, la mecha se pone roja: hay que decidir ya. */
const HURRY_SECONDS = 45;

/**
 * H09.3: la pregunta del domiciliario desde el local. No es un chat: cada producto trae solo sus opciones cerradas
 * y una mecha que se consume con el tiempo que queda. Si se acaba, lo pendiente se quita y la compra sigue.
 */
export function AdjustmentDesk({ order, adjustment, onChanged }: { order: OrderDetail; adjustment: OrderAdjustment; onChanged: () => void }) {
  const t = useTranslations("adjustments");
  const expiresAt = new Date(adjustment.expiresAt).getTime();
  const left = useCountdown(expiresAt);
  const span = Math.max(1, (expiresAt - new Date(adjustment.reportedAt).getTime()) / 1000);
  const pending = adjustment.lines.filter((l) => !l.decision);
  const [busy, setBusy] = useState(false);

  // Al consumirse la mecha, el reloj de la API quita lo pendiente: se vuelve a pedir el pedido para verlo.
  useEffect(() => {
    if (left > 0) return;
    const timer = window.setTimeout(onChanged, 2500);
    return () => window.clearTimeout(timer);
  }, [left, onChanged]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className="overflow-hidden rounded-[28px] bg-white shadow-[0_22px_48px_-24px_rgb(228_87_46/0.6)] ring-2 ring-chonta"
      aria-labelledby="adjustment-title"
    >
      <header className="relative bg-ink px-5 pb-6 pt-5 text-white sm:px-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-brand">{t("kicker")}</p>
            <h2 id="adjustment-title" className="mt-1.5 font-display text-xl font-extrabold leading-tight sm:text-2xl">
              {t("title", { store: order.establishment.name, count: pending.length })}
            </h2>
            <p className="mt-1.5 text-sm text-white/70">{t("body")}</p>
          </div>
          <FuseClock left={left} span={span} />
        </div>
        <Fuse left={left} span={span} />
      </header>

      <ul className="flex flex-col gap-3 p-4 sm:p-5">
        {adjustment.lines.map((line) => (
          <li key={line.id}>
            <LineQuestion order={order} line={line} expired={left === 0} busy={busy} setBusy={setBusy} onChanged={onChanged} />
          </li>
        ))}
      </ul>

      <footer className="flex flex-col gap-3 border-t-2 border-dashed border-ink/10 px-5 pb-5 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-start gap-2 text-xs text-ink/55">
          <Hourglass className="mt-0.5 size-3.5 shrink-0 text-chonta" aria-hidden />
          {left > 0 ? t("timeoutRule") : t("timeoutNow")}
        </p>
        {pending.length > 0 && left > 0 && <CancelOrder order={order} line={pending[0]} busy={busy} setBusy={setBusy} onChanged={onChanged} />}
      </footer>
    </motion.section>
  );
}

/** Reloj redondo con lo que queda (mm:ss). */
function FuseClock({ left, span }: { left: number; span: number }) {
  const t = useTranslations("adjustments");
  const hurry = left <= HURRY_SECONDS;
  const ratio = Math.max(0, Math.min(1, left / span));
  const r = 27;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-[68px] shrink-0 place-items-center" role="timer" aria-label={t("timeLeft", { time: mmss(left) })}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={hurry ? "var(--color-chonta)" : "var(--color-brand)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className={`font-mono text-base font-extrabold tabular-nums ${hurry ? "text-chonta" : "text-brand"}`} aria-hidden>
        {mmss(left)}
      </span>
    </div>
  );
}

/** La mecha: una línea que se consume de derecha a izquierda, con la chispa en la punta. */
function Fuse({ left, span }: { left: number; span: number }) {
  const ratio = Math.max(0, Math.min(1, left / span));
  return (
    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/10" aria-hidden>
      <div className="relative h-full bg-gradient-to-r from-chonta to-brand transition-[width] duration-1000 ease-linear" style={{ width: `${ratio * 100}%` }}>
        {ratio > 0 && <span className="route-current absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full bg-brand" />}
      </div>
    </div>
  );
}

const optionLook: Record<string, { icon: typeof Trash2; tone: string }> = {
  SUBSTITUTE: { icon: ArrowLeftRight, tone: "bg-brand text-ink hover:bg-[#ffcf55]" },
  ACCEPT_PRICE: { icon: BadgeCheck, tone: "bg-leaf text-white hover:bg-leaf/90" },
  REMOVE_ITEM: { icon: Trash2, tone: "bg-cream text-ink hover:bg-chonta-soft" },
};

/** Una línea con problema: qué pasó y sus opciones; o, si ya decidió, lo que eligió. */
function LineQuestion({
  order,
  line,
  expired,
  busy,
  setBusy,
  onChanged,
}: {
  order: OrderDetail;
  line: OrderAdjustmentLine;
  expired: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("adjustments");
  const money = useCatalogFormat();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<unknown>(null);
  const [picking, setPicking] = useState(false);
  const priceChanged = line.reason === "PRICE_CHANGED" && line.reportedUnitPrice;

  const decide = async (decision: AdjustmentDecision, productVersionId?: string) => {
    setBusy(true);
    setError(null);
    try {
      await container.orders.decideAdjustment(order.code, line.id, { decision, productVersionId });
      setPicking(false);
      onChanged();
    } catch (e) {
      setError(e);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`rounded-[22px] border-2 p-4 transition-colors ${line.decision ? "border-ink/5 bg-cream/60" : "border-dashed border-chonta/40 bg-white"}`}>
      <div className="flex items-start gap-3">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${line.reason === "UNAVAILABLE" ? "-rotate-6 bg-chonta text-white" : "rotate-3 bg-brand text-ink"}`}
          aria-hidden
        >
          {line.reason === "UNAVAILABLE" ? <PackageX className="size-5" /> : <Tag className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold leading-tight">
            <span className="text-chonta">{line.quantity}×</span> {line.name}
          </p>
          {priceChanged ? (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold text-ink/60">{t("reason.PRICE_CHANGED")}</span>
              <s className="tabular-nums text-ink/40">{money.price(line.unitPrice)}</s>
              <span className="font-display text-base font-extrabold tabular-nums text-chonta-strong">{t("perUnit", { price: money.price(line.reportedUnitPrice!) })}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-chonta-strong">{t("reason.UNAVAILABLE")}</p>
          )}
        </div>
      </div>

      {line.decision ? (
        <Decided line={line} />
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {line.options
            .filter((option) => option !== "CANCEL_ORDER")
            .map((option) => {
              const look = optionLook[option] ?? optionLook.REMOVE_ITEM;
              const delta = decisionDeltaCents(line, option);
              return (
                <OptionButton
                  key={option}
                  icon={<look.icon className="size-5" aria-hidden />}
                  tone={look.tone}
                  label={t(`option.${option}`)}
                  hint={option === "SUBSTITUTE" ? t("hint.SUBSTITUTE") : delta === null ? null : signed(money.cents, delta)}
                  disabled={busy || expired}
                  onClick={() => (option === "SUBSTITUTE" ? setPicking(true) : void decide(option))}
                />
              );
            })}
        </div>
      )}
      {!!error && <Alert className="mt-3">{errorMessage(error)}</Alert>}
      {picking && (
        <SubstitutePicker order={order} line={line} busy={busy} onPick={(option) => void decide("SUBSTITUTE", option.productVersionId)} onClose={() => !busy && setPicking(false)} />
      )}
    </article>
  );
}

/** "+$500" / "−$12.000" / "Mismo precio". */
function signed(format: (cents: number) => string, cents: number) {
  if (cents === 0) return "=";
  return `${cents > 0 ? "+" : "−"}${format(Math.abs(cents))}`;
}

function OptionButton({ icon, tone, label, hint, disabled, onClick }: { icon: ReactNode; tone: string; label: string; hint: string | null; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-14 items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left font-bold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${tone}`}
    >
      {icon}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs font-semibold tabular-nums opacity-70">{hint}</span>}
      </span>
    </button>
  );
}

/** Lo que eligió (o lo que pasó al acabarse el tiempo). */
function Decided({ line }: { line: OrderAdjustmentLine }) {
  const t = useTranslations("adjustments");
  const money = useCatalogFormat();
  return (
    <p className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-leaf">
      <BadgeCheck className="size-4 shrink-0" aria-hidden />
      {line.decision === "SUBSTITUTE" && line.substitute
        ? t("decided.SUBSTITUTE", { name: line.substitute.name, price: money.price(line.substitute.unitPrice) })
        : t.has(`decided.${line.decision}`)
          ? t(`decided.${line.decision}`)
          : line.decision}
    </p>
  );
}

/** "Cambiar por": primero lo de la misma sección del menú y precio parecido (lo ordena la API). */
function SubstitutePicker({
  order,
  line,
  busy,
  onPick,
  onClose,
}: {
  order: OrderDetail;
  line: OrderAdjustmentLine;
  busy: boolean;
  onPick: (option: SubstituteOption) => void;
  onClose: () => void;
}) {
  const t = useTranslations("adjustments");
  const locale = useLocale();
  const money = useCatalogFormat();
  const errorMessage = useErrorMessage();
  const [state, setState] = useState<{ items: SubstituteOption[] | null; error: unknown }>({ items: null, error: null });
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    container.orders.substitutes(order.code, line.id, locale).then(
      (items) => alive && setState({ items, error: null }),
      (error) => alive && setState({ items: [], error }),
    );
    return () => {
      alive = false;
    };
  }, [order.code, line.id, locale]);

  const groups = useMemo(() => {
    const items = state.items ?? [];
    return [items.filter((i) => i.sameSection), items.filter((i) => !i.sameSection)];
  }, [state.items]);

  return (
    <Dialog open onClose={onClose} title={t("pickTitle", { name: line.name })} description={t("pickBody", { quantity: line.quantity })} size="lg" closeLabel={t("close")}>
      {!!state.error && <Alert className="mb-4">{errorMessage(state.error)}</Alert>}
      {state.items === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-cream" />
          ))}
        </div>
      ) : state.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-cream px-6 py-10 text-center">
          <CircleSlash2 className="size-8 text-chonta" aria-hidden />
          <p className="font-display text-lg font-extrabold">{t("pickEmpty")}</p>
          <p className="text-sm text-ink/60">{t("pickEmptyBody")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((items, group) =>
            items.length ? (
              <section key={group}>
                <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-chonta">{group === 0 ? t("pickSimilar") : t("pickOthers")}</h3>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {items.map((item) => {
                    const delta = decisionDeltaCents(line, "SUBSTITUTE", item.price) ?? 0;
                    return (
                      <li key={item.productVersionId}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setChosen(item.productVersionId);
                            onPick(item);
                          }}
                          className={`group flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 bg-white text-left transition hover:-translate-y-0.5 hover:border-brand disabled:opacity-60 ${
                            chosen === item.productVersionId ? "border-brand" : "border-ink/10"
                          }`}
                        >
                          <span className="relative block aspect-[4/3] bg-cream">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- URL firmada que vence: no pasa por el optimizador
                              <img src={item.imageUrl} alt="" className="size-full object-cover" />
                            ) : (
                              <span className="grid size-full place-items-center font-display text-3xl font-extrabold text-chonta/40">{item.name.slice(0, 1)}</span>
                            )}
                            <span
                              className={`absolute bottom-2 left-2 rounded-lg px-2 py-0.5 text-xs font-extrabold tabular-nums ${
                                delta > 0 ? "bg-ink text-brand" : delta < 0 ? "bg-leaf text-white" : "bg-white text-ink"
                              }`}
                            >
                              {delta === 0 ? t("samePrice") : signed(money.cents, delta)}
                            </span>
                          </span>
                          <span className="flex flex-1 flex-col gap-0.5 p-3">
                            <span className="line-clamp-2 text-sm font-bold leading-snug">{item.name}</span>
                            <span className="mt-auto font-display font-extrabold tabular-nums">{money.price(item.price)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Cancelar todo responde por toda la pregunta: va aparte y con confirmación. */
function CancelOrder({
  order,
  line,
  busy,
  setBusy,
  onChanged,
}: {
  order: OrderDetail;
  line: OrderAdjustmentLine;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("adjustments");
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await container.orders.decideAdjustment(order.code, line.id, { decision: "CANCEL_ORDER" });
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={busy} className="shrink-0 self-start whitespace-nowrap !text-chonta-strong">
        <XCircle className="size-4" aria-hidden /> {t("cancelOrder")}
      </Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} title={t("cancelTitle")} description={t("cancelBody", { store: order.establishment.name })} closeLabel={t("close")}>
        {!!error && <Alert className="mb-4">{errorMessage(error)}</Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {t("keepOrder")}
          </Button>
          <Button variant="dark" loading={busy} onClick={() => void confirm()}>
            {t("cancelConfirm")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/**
 * En el recibo: lo que cambió por las preguntas ya respondidas (quitado, cambiado, precio nuevo o quitado por
 * tiempo). El total de arriba ya lo incluye: la API lo calcula con las líneas efectivas.
 */
export function AdjustmentChanges({ adjustments }: { adjustments: OrderAdjustment[] }) {
  const t = useTranslations("adjustments");
  const money = useCatalogFormat();
  const lines = adjustments.filter((a) => !a.open).flatMap((a) => a.lines.filter((l) => l.decision && l.decision !== "CANCEL_ORDER"));
  if (!lines.length) return null;
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1 border-t-2 border-dashed border-ink/15 pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-chonta">
          <ShoppingBasket className="size-3.5" aria-hidden /> {t("changesTitle")}
        </p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {lines.map((line) => (
            <li key={line.id} className="flex items-baseline gap-2">
              <span className={`min-w-0 flex-1 ${line.decision === "ACCEPT_PRICE" ? "" : "text-ink/45 line-through decoration-chonta/60"}`}>
                {line.quantity}× {line.name}
              </span>
              <span className="shrink-0 text-xs font-bold text-ink/60">
                {line.decision === "SUBSTITUTE" && line.substitute
                  ? t("change.SUBSTITUTE", { name: line.substitute.name })
                  : line.decision === "ACCEPT_PRICE" && line.reportedUnitPrice
                    ? t("change.ACCEPT_PRICE", { price: money.price(line.reportedUnitPrice) })
                    : t.has(`change.${line.decision}`)
                      ? t(`change.${line.decision}`)
                      : line.decision}
              </span>
            </li>
          ))}
        </ul>
      </motion.div>
    </AnimatePresence>
  );
}
