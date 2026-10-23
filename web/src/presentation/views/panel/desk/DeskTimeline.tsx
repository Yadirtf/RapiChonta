"use client";

import { Clock4, FileSearch, Flame, HandCoins, KeyRound, Megaphone, MessageCircleQuestion, Undo2, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { createElement, type ReactNode } from "react";
import { fullName } from "@/core/domain/entities/account";
import type { DeskEvent } from "@/core/domain/entities/desk";
import { statusIcon } from "../../../components/orders/orderVisuals";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";
import { useOrderTime } from "../../orders/useOrderDate";

const KIND_LOOK: Record<Exclude<DeskEvent["kind"], "STATUS">, { icon: LucideIcon; tint: string }> = {
  OFFER: { icon: Megaphone, tint: "bg-brand text-ink" },
  RELEASE: { icon: Undo2, tint: "bg-ink/10 text-ink" },
  DELAY: { icon: Flame, tint: "bg-brand text-chonta-strong" },
  ADJUSTMENT: { icon: MessageCircleQuestion, tint: "bg-brand text-ink" },
  CODE_ATTEMPT: { icon: KeyRound, tint: "bg-chonta-soft text-chonta-strong" },
  COLLECTION: { icon: HandCoins, tint: "bg-leaf text-white" },
  INCIDENT: { icon: FileSearch, tint: "bg-chonta text-white" },
};

/**
 * La línea de tiempo del pedido en la libreta de la bitácora: la hora en el margen de chontaduro y en el renglón
 * quién hizo qué (persona y rol, o el sistema: geocerca, tiempo) con el comentario que dejó.
 */
export function DeskTimeline({ events, now }: { events: DeskEvent[]; now: number }) {
  const t = useTranslations("desk.timeline");
  const time = useOrderTime();
  if (!events.length) return <p className="text-sm text-ink/50">{t("empty")}</p>;
  // Los intentos de código seguidos se leen como uno solo: "Código equivocado ×5".
  const entries = events.reduce<{ event: DeskEvent; times: number }[]>((list, event) => {
    const last = list[list.length - 1];
    if (last && event.kind === "CODE_ATTEMPT" && last.event.kind === "CODE_ATTEMPT") last.times++;
    else list.push({ event, times: 1 });
    return list;
  }, []);
  return (
    <ol className="ledger rounded-2xl bg-white ring-1 ring-ink/10 [--ledger-margin:92px]" aria-label={t("label")}>
      {entries.reverse().map(({ event, times }, i) => (
        <li key={i} className="grid grid-cols-[92px_1fr] gap-x-3 py-3 pr-4">
          <time dateTime={event.at} className="whitespace-nowrap pr-2.5 pt-1.5 text-right font-display text-xs font-extrabold tabular-nums text-ink/55">
            {time(event.at)}
          </time>
          <Entry event={event} times={times} now={now} />
        </li>
      ))}
    </ol>
  );
}

function Entry({ event, times, now }: { event: DeskEvent; times: number; now: number }) {
  const t = useTranslations("desk.timeline");
  const ts = useTranslations("orderStatus");
  const tr = useTranslations("roles");
  const td = useTranslations("desk");
  const tp = useTranslations("payment");
  const { price } = useCatalogFormat();
  const status = (code: string) => (ts.has(`${code}.label`) ? ts(`${code}.label`) : code);
  const role = (code: string) => (tr.has(code) ? tr(code) : code);
  const first = (p: { givenNames: string }) => p.givenNames.split(" ")[0];

  let icon: ReactNode;
  let line: ReactNode;
  let who: string | null = null;
  let note: string | null = null;
  let extra: ReactNode = null;

  switch (event.kind) {
    case "STATUS":
      icon = <Dot tint={event.to === "CANCELLED" ? "bg-ink/10 text-ink/60" : event.to === "DELIVERED" ? "bg-leaf text-white" : "bg-ink text-brand"} icon={statusIcon(event.to)} />;
      line = t("status", { status: status(event.to) });
      who = event.actor ? `${fullName(event.actor)} · ${role(event.actor.role)}` : t(`sources.${event.source}`);
      note = event.note;
      break;
    case "OFFER": {
      const looked = KIND_LOOK.OFFER;
      icon = <Dot tint={looked.tint} icon={looked.icon} />;
      line = event.mode === "BROADCAST" ? t("offerAll", { count: event.recipients.length }) : t("offerOne", { name: event.recipients[0] ? first(event.recipients[0]) : "" });
      who = event.sentBy ? fullName(event.sentBy) : null;
      extra = (
        <span className="mt-1 flex flex-wrap gap-1.5">
          {event.recipients.map((r, i) => (
            <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.status === "ACCEPTED" ? "bg-leaf/15 text-leaf" : r.status === "REJECTED" ? "bg-chonta-soft text-chonta-strong" : "bg-ink/[0.06] text-ink/60"}`}>
              {first(r)} · {t(`recipient.${["PENDING", "ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"].includes(r.status) ? r.status : "PENDING"}`)}
            </span>
          ))}
        </span>
      );
      break;
    }
    case "RELEASE":
      icon = <Dot tint={KIND_LOOK.RELEASE.tint} icon={KIND_LOOK.RELEASE.icon} />;
      line = t(`release.${["COURIER_RELEASED", "OPERATOR_REASSIGNED", "ORDER_CANCELLED", "ORDER_COMPLETED"].includes(event.reason) ? event.reason : "COURIER_RELEASED"}`, { name: fullName(event.courier) });
      who = event.by ? fullName(event.by) : null;
      break;
    case "DELAY":
      icon = <Dot tint={KIND_LOOK.DELAY.tint} icon={KIND_LOOK.DELAY.icon} />;
      line = t("delay");
      break;
    case "ADJUSTMENT":
      icon = <Dot tint={KIND_LOOK.ADJUSTMENT.tint} icon={KIND_LOOK.ADJUSTMENT.icon} />;
      line = t("adjustment", { count: event.lines.length });
      extra = (
        <span className="mt-1 block text-xs text-ink/60">
          {event.lines.map((l) => `${l.name}: ${l.decision ? t(`decision.${l.decision}`) : new Date(event.expiresAt).getTime() > now ? t("decisionPending") : "—"}`).join(" · ")}
        </span>
      );
      break;
    case "CODE_ATTEMPT":
      icon = <Dot tint={KIND_LOOK.CODE_ATTEMPT.tint} icon={KIND_LOOK.CODE_ATTEMPT.icon} />;
      line = t("codeAttempt", { count: times });
      break;
    case "COLLECTION":
      icon = <Dot tint={KIND_LOOK.COLLECTION.tint} icon={KIND_LOOK.COLLECTION.icon} />;
      line = t("collection", { amount: price(event.amount), method: tp.has(event.paymentMethod) ? tp(event.paymentMethod) : event.paymentMethod });
      break;
    case "INCIDENT":
      icon = <Dot tint={KIND_LOOK.INCIDENT.tint} icon={KIND_LOOK.INCIDENT.icon} />;
      line =
        event.status === "OPEN"
          ? t("incidentOpened", { type: td(`incidentTypes.${event.type}`) })
          : event.status === "IN_REVIEW"
            ? t("incidentTaken")
            : t("incidentResolved", { resolution: event.resolution ? td(`resolutions.${event.resolution}.label`) : "" });
      who = `${fullName(event.by)} · ${role(event.by.role)}`;
      note = event.note;
      break;
    default:
      icon = <Dot tint="bg-ink/10 text-ink" icon={Clock4} />;
      line = null;
  }

  return (
    <div className="flex min-w-0 gap-3">
      {icon}
      <div className="min-w-0 text-sm">
        <p className="font-bold leading-snug">{line}</p>
        {who && <p className="text-xs text-ink/55">{who}</p>}
        {extra}
        {note && <p className="mt-1.5 rounded-xl bg-cream px-3 py-1.5 text-[13px] italic text-ink/75">“{note}”</p>}
      </div>
    </div>
  );
}

function Dot({ tint, icon }: { tint: string; icon: LucideIcon }) {
  return (
    <span className={`grid size-7 shrink-0 place-items-center rounded-full ${tint}`} aria-hidden>
      {createElement(icon, { className: "size-3.5", strokeWidth: 2.5 })}
    </span>
  );
}
