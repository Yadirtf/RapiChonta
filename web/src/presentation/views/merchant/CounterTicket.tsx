"use client";

import { motion } from "framer-motion";
import { Bike, Check, Clock, MessageSquareText, PackageCheck, Phone, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { elapsed } from "@/core/domain/entities/dispatch";
import { QUICK_MINUTES, RESPONSE_WARN_SECONDS, type CounterOrder } from "@/core/domain/entities/merchant";
import { Button } from "../../components/ui/Button";
import { formatPhone } from "../../format";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";

/** Dónde va el domiciliario, en palabras del local: lo busca RapiChonta, viene en camino o ya está aquí. */
function courierStep(order: CounterOrder): "SEARCHING" | "COMING" | "HERE" {
  if (order.status === "AT_ESTABLISHMENT") return "HERE";
  if (order.courier) return "COMING";
  return "SEARCHING";
}

interface Props {
  order: CounterOrder;
  now: number;
  busy: boolean;
  limits: { min: number; max: number };
  onAccept: (minutes: number) => void;
  onDecline: () => void;
  onReady: () => void;
}

/**
 * Una comanda del mostrador. Por aceptar: qué pidieron, cuánto le paga el domiciliario al recoger y el tiempo que el
 * comercio promete (sugerido por su menú, con atajos). En el fogón: la cuenta hacia la hora prometida y quién viene.
 */
export function CounterTicket({ order, now, busy, limits, onAccept, onDecline, onReady }: Props) {
  const t = useTranslations("merchant.ticket");
  const { price } = useCatalogFormat();
  const incoming = order.lane === "INCOMING";
  const waiting = (now - new Date(order.createdAt).getTime()) / 1000;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: -18, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className={`comanda px-4 pb-4 pt-5 ${incoming ? "is-new" : ""} ${order.lane === "READY" ? "[--paper:#eaf6ef]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-2xl font-extrabold leading-none tracking-tight">{order.code}</p>
          <p className="mt-1 truncate text-sm font-bold text-ink/70">{t("for", { name: order.customerName })}</p>
        </div>
        {incoming ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums ${waiting >= RESPONSE_WARN_SECONDS ? "animate-pulse bg-chonta text-white" : "bg-ink text-white"}`}
            title={t("waitingTitle")}
          >
            <Clock className="size-3.5" strokeWidth={2.6} aria-hidden />
            {elapsed(waiting)}
          </span>
        ) : (
          <PromiseClock order={order} now={now} />
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-1.5 border-y border-dashed border-ink/15 py-3">
        {order.lines.map((line, index) => (
          <li key={`${line.name}-${index}`} className="flex gap-2 text-sm">
            <span className="w-8 shrink-0 font-display font-extrabold tabular-nums">{line.quantity}×</span>
            <span className="min-w-0">
              <span className="font-semibold">{line.name}</span>
              {line.notes && <span className="block text-xs italic text-chonta-strong">“{line.notes}”</span>}
            </span>
          </li>
        ))}
      </ul>
      {order.customerNotes && (
        <p className="mt-2 flex gap-1.5 text-xs text-ink/65">
          <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{order.customerNotes}</span>
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink/55">{t("courierPays")}</span>
        <span className="price-tag [--tag-hole:var(--color-cream)] text-sm">{price(order.itemsTotal)}</span>
      </div>

      {incoming ? (
        <AcceptControls order={order} busy={busy} limits={limits} onAccept={onAccept} onDecline={onDecline} />
      ) : (
        <PreparationFooter order={order} busy={busy} onReady={onReady} />
      )}
    </motion.article>
  );
}

function AcceptControls({ order, busy, limits, onAccept, onDecline }: Pick<Props, "order" | "busy" | "limits" | "onAccept" | "onDecline">) {
  const t = useTranslations("merchant.ticket");
  const [minutes, setMinutes] = useState(order.suggestedMinutes);
  const quick = [...new Set([order.suggestedMinutes, ...QUICK_MINUTES])].sort((a, b) => a - b).slice(0, 6);

  return (
    <div className="mt-4 flex flex-col gap-3">
      <fieldset>
        <legend className="text-xs font-extrabold uppercase tracking-wider text-ink/55">{t("howLong")}</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quick.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMinutes(value)}
              aria-pressed={minutes === value}
              className={`relative h-9 min-w-12 rounded-xl px-2.5 text-sm font-extrabold tabular-nums ring-1 transition-colors ${
                minutes === value ? "bg-ink text-brand ring-ink" : "bg-white text-ink ring-ink/10 hover:ring-ink/30"
              }`}
            >
              {value}′
              {value === order.suggestedMinutes && (
                <span className="absolute -right-1 -top-1.5 rounded-full bg-brand px-1 text-[9px] font-extrabold text-ink">{t("menuTime")}</span>
              )}
            </button>
          ))}
          <label className="flex h-9 items-center gap-1 rounded-xl bg-white px-2 text-sm ring-1 ring-ink/10 focus-within:ring-ink/40">
            <span className="sr-only">{t("otherMinutes")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={limits.min}
              max={limits.max}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(limits.min, Math.min(limits.max, Math.trunc(Number(e.target.value) || limits.min))))}
              className="w-12 bg-transparent text-center font-extrabold tabular-nums outline-none"
            />
            <span className="text-xs font-bold text-ink/50">min</span>
          </label>
        </div>
      </fieldset>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDecline} disabled={busy} className="shrink-0 text-chonta-strong hover:bg-chonta-soft hover:text-chonta-strong">
          <X className="size-4" aria-hidden /> {t("decline")}
        </Button>
        <Button block loading={busy} onClick={() => onAccept(minutes)} className="bg-leaf text-white hover:bg-[#1a6942]">
          <Check className="size-4" strokeWidth={3} aria-hidden /> {t("accept", { minutes })}
        </Button>
      </div>
    </div>
  );
}

function PreparationFooter({ order, busy, onReady }: Pick<Props, "order" | "busy" | "onReady">) {
  const t = useTranslations("merchant.ticket");
  const step = courierStep(order);
  const Icon = step === "SEARCHING" ? Search : Bike;
  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${step === "HERE" ? "bg-leaf/10 text-leaf" : "bg-ink/5 text-ink/70"}`}>
        <Icon className={`size-4 shrink-0 ${step === "SEARCHING" ? "animate-pulse" : ""}`} aria-hidden />
        <span className="min-w-0 flex-1">
          {t(`courier.${step}`, {
            name: order.courier?.givenNames.split(" ")[0] ?? "",
          })}
        </span>
        {order.courier?.phone && (
          <a
            href={`tel:${order.courier.phone}`}
            className="inline-flex items-center gap-1 text-xs font-bold underline-offset-2 hover:underline"
            title={formatPhone(order.courier.phone)}
          >
            <Phone className="size-3.5" aria-hidden /> {t("call")}
          </a>
        )}
      </p>
      {order.readyAt ? (
        <span className="stamp self-center text-leaf">{t("readyStamp")}</span>
      ) : (
        <Button block loading={busy} onClick={onReady}>
          <PackageCheck className="size-4" aria-hidden /> {t("markReady")}
        </Button>
      )}
    </div>
  );
}

/** La hora prometida: un anillo que se llena y se pone rojo cuando el tiempo se pasa. */
function PromiseClock({ order, now }: { order: CounterOrder; now: number }) {
  const t = useTranslations("merchant.ticket");
  if (!order.acceptedAt || !order.estimatedReadyAt) return null;
  const start = new Date(order.acceptedAt).getTime();
  const end = new Date(order.estimatedReadyAt).getTime();
  const done = order.readyAt ? 1 : Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  const late = !order.readyAt && now > end;
  const left = Math.round((end - now) / 60_000);
  const R = 15;
  const C = 2 * Math.PI * R;
  return (
    <span className="flex shrink-0 items-center gap-2" title={t("promiseTitle", { minutes: order.preparationMinutes ?? 0 })}>
      <span className="text-right text-xs font-extrabold leading-tight tabular-nums">
        {order.readyAt ? t("readyShort") : late ? t("late", { minutes: -left }) : t("left", { minutes: Math.max(0, left) })}
      </span>
      <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={R} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth="5" />
        <circle
          cx="18"
          cy="18"
          r={R}
          fill="none"
          strokeLinecap="round"
          strokeWidth="5"
          className={order.readyAt ? "stroke-leaf" : late ? "stroke-chonta" : "stroke-brand"}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - done)}
        />
      </svg>
    </span>
  );
}
