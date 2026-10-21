"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, BookOpenText, CalendarRange, ClipboardList, Clock, Loader2, Megaphone, Search, Settings2, Store, X, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fullName } from "@/core/domain/entities/account";
import type { StaffActivityEntry, StaffActivityFilters } from "@/core/domain/entities/dispatch";
import { container } from "@/infrastructure/di/container";
import { Alert } from "../../../components/ui/Alert";
import { DatePicker } from "../../../components/ui/DatePicker";
import { SelectField, TextField } from "../../../components/ui/Field";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";

const ZONE = "America/Bogota";
/** Día de negocio en Colombia, "YYYY-MM-DD", corrido `offset` días. */
const businessDay = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: ZONE });

type Group = "order" | "people" | "config" | "catalog";
const GROUPS: Record<string, Group> = {
  ORDER_OFFERED: "order",
  ORDER_STATUS_CHANGED: "order",
  ORDER_CANCELLED: "order",
  ORDER_REASSIGNED: "order",
  INCIDENT_RESOLVED: "order",
  DELIVERY_PROOF_REVIEWED: "order",
  USER_CREATED: "people",
  USER_DEACTIVATED: "people",
  ROLE_GRANTED: "people",
  ROLE_REVOKED: "people",
  COURIER_VERIFIED: "people",
  PRODUCT_CHANGED: "catalog",
  ESTABLISHMENT_CHANGED: "catalog",
  CATEGORY_CHANGED: "catalog",
};
const GROUP_LOOK: Record<Group, { icon: LucideIcon; tint: string }> = {
  order: { icon: ClipboardList, tint: "bg-chonta text-white" },
  people: { icon: BadgeCheck, tint: "bg-leaf text-white" },
  catalog: { icon: Store, tint: "bg-brand text-ink" },
  config: { icon: Settings2, tint: "bg-ink text-brand" },
};

/**
 * H07.5: bitácora del personal. Una libreta de renglones con margen de chontaduro: la hora en el margen,
 * quién hizo qué en el renglón y el pedido como sello. Se lee de la más reciente a la más antigua y se
 * filtra por días, persona y pedido; las entradas son de solo lectura.
 */
export function AuditView() {
  const t = useTranslations("audit");
  const errorMessage = useErrorMessage();
  const locale = useLocale();
  const tag = locale === "en" ? "en-US" : "es-CO";

  const [range, setRange] = useState({ from: businessDay(-6), to: businessDay() });
  const [actorUserId, setActorUserId] = useState("");
  const [orderDraft, setOrderDraft] = useState("");
  const [order, setOrder] = useState("");
  const filters: StaffActivityFilters = useMemo(
    () => ({ from: range.from, to: range.to, actorUserId: actorUserId || undefined, order: order || undefined }),
    [range, actorUserId, order],
  );

  // El código del pedido se busca al dejar de escribir, no en cada tecla.
  useEffect(() => {
    const timer = window.setTimeout(() => setOrder(orderDraft.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [orderDraft]);

  const actors = useResource(() => container.dispatch.activityActors(), []);
  const first = useResource(() => container.dispatch.activity(filters), [filters]);
  const [more, setMore] = useState<{ entries: StaffActivityEntry[]; cursor: string | null; loading: boolean; error: unknown }>({
    entries: [],
    cursor: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    setMore({ entries: [], cursor: first.data?.nextCursor ?? null, loading: false, error: null });
  }, [first.data]);

  const loadMore = useCallback(async () => {
    if (!more.cursor) return;
    setMore((m) => ({ ...m, loading: true, error: null }));
    try {
      const page = await container.dispatch.activity(filters, more.cursor);
      setMore((m) => ({ entries: [...m.entries, ...page.entries], cursor: page.nextCursor, loading: false, error: null }));
    } catch (error) {
      setMore((m) => ({ ...m, loading: false, error }));
    }
  }, [filters, more.cursor]);

  const entries = useMemo(() => [...(first.data?.entries ?? []), ...more.entries], [first.data, more.entries]);
  const days = useMemo(() => {
    const byDay = new Map<string, StaffActivityEntry[]>();
    for (const entry of entries) {
      const day = new Date(entry.occurredAt).toLocaleDateString("en-CA", { timeZone: ZONE });
      byDay.set(day, [...(byDay.get(day) ?? []), entry]);
    }
    return [...byDay.entries()];
  }, [entries]);

  const dayTitle = (iso: string) => {
    if (iso === businessDay()) return t("today");
    if (iso === businessDay(-1)) return t("yesterday");
    const label = new Intl.DateTimeFormat(tag, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  const clock = (at: string) => new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit", timeZone: ZONE }).format(new Date(at));

  const filtered = !!actorUserId || !!order;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-chonta-strong">
          <BookOpenText className="size-4" aria-hidden /> {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-ink/60">{t("subtitle")}</p>
      </header>

      <div className="grid gap-3 rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-ink/5 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
        <RangePicker value={range} onChange={setRange} />
        <SelectField label={t("who")} value={actorUserId} onChange={(e) => setActorUserId(e.target.value)}>
          <option value="">{t("everyone")}</option>
          {(actors.data ?? []).map((a) => (
            <option key={a.userId} value={a.userId}>
              {fullName(a)}
            </option>
          ))}
        </SelectField>
        <div className="relative">
          <TextField
            label={t("order")}
            placeholder={t("orderPlaceholder")}
            value={orderDraft}
            onChange={(e) => setOrderDraft(e.target.value.toUpperCase())}
            className="pl-11 font-display font-bold uppercase tracking-wide"
            autoComplete="off"
            spellCheck={false}
          />
          <Search className="pointer-events-none absolute bottom-4 left-4 size-4 text-ink/35" aria-hidden />
        </div>
      </div>

      {first.error ? <Alert>{errorMessage(first.error)}</Alert> : null}

      <section aria-busy={first.loading} className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-ink/5">
        <div className="awning awning-sm h-5" aria-hidden />
        {first.loading && !first.data ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="size-6 animate-spin text-ink/40" aria-hidden />
          </div>
        ) : days.length === 0 ? (
          <div className="ledger flex flex-col items-center px-6 py-16 pl-20 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-cream text-chonta-strong">
              <BookOpenText className="size-6" aria-hidden />
            </span>
            <p className="mt-4 font-bold">{t("emptyTitle")}</p>
            <p className="mt-1 max-w-sm text-sm text-ink/55">{filtered ? t("emptyFiltered") : t("emptyBody")}</p>
          </div>
        ) : (
          <div className={first.loading ? "opacity-60 transition" : "transition"}>
            {days.map(([day, list]) => (
              <div key={day}>
                <h2 className="sticky top-0 z-10 flex items-baseline justify-between border-b border-ink/10 bg-cream/95 px-5 py-2.5 backdrop-blur-sm sm:pl-[84px]">
                  <span className="font-display font-extrabold">{dayTitle(day)}</span>
                  <span className="text-xs font-semibold text-ink/45">{t("entries", { count: list.length })}</span>
                </h2>
                <ol className="ledger">
                  {list.map((entry) => (
                    <Line key={entry.id} entry={entry} time={clock(entry.occurredAt)} onOrder={setOrderDraft} />
                  ))}
                </ol>
              </div>
            ))}
            {(more.cursor || !!more.error) && (
              <div className="flex flex-col items-center gap-2 border-t border-ink/10 bg-cream/60 px-5 py-4">
                {more.error != null ? <Alert className="w-full">{errorMessage(more.error)}</Alert> : null}
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={more.loading || !more.cursor}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-brand transition hover:bg-ink/90 disabled:opacity-60"
                >
                  {more.loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {t("loadMore")}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Un renglón de la libreta: hora en el margen, sello de quién, qué hizo y el pedido. */
function Line({ entry, time, onOrder }: { entry: StaffActivityEntry; time: string; onOrder: (code: string) => void }) {
  const t = useTranslations("audit");
  const tr = useTranslations("roles");
  const look = GROUP_LOOK[GROUPS[entry.action] ?? (entry.action.endsWith("_CHANGED") ? "config" : "people")];
  const Icon = entry.action === "ORDER_OFFERED" ? Megaphone : look.icon;
  const details = useDetails(entry);

  return (
    <li className="grid grid-cols-[64px_1fr] items-start gap-x-4 py-3 pr-4 sm:grid-cols-[64px_auto_1fr] sm:pr-5">
      <span className="pt-1.5 text-right text-xs font-bold tabular-nums text-ink/45">{time}</span>
      <span className={`hidden size-9 place-items-center rounded-xl sm:grid ${look.tint}`} aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="col-start-2 min-w-0 sm:col-start-3">
        <p className="text-[15px] leading-snug">
          <span className="font-extrabold">{entry.actor ? fullName(entry.actor) : t("system")}</span>{" "}
          {entry.actor?.role ? <span className="text-xs font-semibold text-ink/45">· {tr.has(entry.actor.role) ? tr(entry.actor.role) : entry.actor.role} </span> : null}
          <span className="text-ink/75">{details.sentence}</span>
          {entry.orderCode ? (
            <>
              {" "}
              <button
                type="button"
                onClick={() => onOrder(entry.orderCode!)}
                title={t("filterByOrder")}
                className="stamp align-middle text-chonta-strong transition hover:text-chonta"
              >
                {entry.orderCode}
              </button>
            </>
          ) : null}
        </p>
        {details.note ? <p className="mt-1 rounded-xl bg-cream px-3 py-1.5 text-sm text-ink/70">“{details.note}”</p> : null}
        {details.changes.length > 0 && (
          <details className="group mt-1">
            <summary className="cursor-pointer list-none text-xs font-bold text-ink/45 hover:text-ink/70">
              <span className="group-open:hidden">{t("showChanges", { count: details.changes.length })}</span>
              <span className="hidden group-open:inline">{t("hideChanges")}</span>
            </summary>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-ink/[0.03] px-3 py-2 font-mono text-xs">
              {details.changes.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-ink/45">{key}</dt>
                  <dd className="break-all text-ink/75">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>
    </li>
  );
}

/** Frase en lenguaje de la operación para cada acción; lo que no tiene frase propia se muestra como cambios. */
function useDetails(entry: StaffActivityEntry): { sentence: string; note: string | null; changes: [string, string][] } {
  const t = useTranslations("audit");
  const ts = useTranslations("orderStatus");
  const tr = useTranslations("roles");
  const d = entry.details ?? {};
  const str = (key: string) => (typeof d[key] === "string" ? (d[key] as string) : null);
  const note = str("note");

  switch (entry.action) {
    case "ORDER_OFFERED":
      return {
        sentence: str("mode") === "BROADCAST" ? t("actions.ORDER_OFFERED_ALL", { count: Number(d.recipients ?? 0) }) : t("actions.ORDER_OFFERED_ONE"),
        note: null,
        changes: [],
      };
    case "ORDER_STATUS_CHANGED": {
      const to = str("to") ?? "";
      return { sentence: t("actions.ORDER_STATUS_CHANGED", { status: ts.has(`${to}.label`) ? ts(`${to}.label`) : to }), note, changes: [] };
    }
    case "ORDER_CANCELLED":
      return { sentence: t("actions.ORDER_CANCELLED"), note, changes: [] };
    case "ORDER_REASSIGNED":
      return { sentence: t("actions.ORDER_REASSIGNED"), note: null, changes: [] };
    case "ROLE_GRANTED":
    case "ROLE_REVOKED": {
      const role = str("role");
      return { sentence: t(`actions.${entry.action}`, { role: role && tr.has(role) ? tr(role) : (role ?? "") }), note: null, changes: [] };
    }
  }
  const changes = Object.entries(d)
    .filter(([key]) => key !== "note")
    .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)] as [string, string]);
  return { sentence: t.has(`actions.${entry.action}`) ? t(`actions.${entry.action}`) : t("actions.OTHER", { action: entry.action }), note, changes };
}

/** Rango de días: atajos de uso diario y, si hace falta, dos calendarios propios (nada de `<input type="date">`). */
function RangePicker({ value, onChange }: { value: { from: string; to: string }; onChange: (range: { from: string; to: string }) => void }) {
  const t = useTranslations("audit");
  const locale = useLocale();
  const tag = locale === "en" ? "en-US" : "es-CO";
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const presets = [
    { key: "today", from: businessDay(), to: businessDay() },
    { key: "yesterday", from: businessDay(-1), to: businessDay(-1) },
    { key: "week", from: businessDay(-6), to: businessDay() },
    { key: "month", from: businessDay(-29), to: businessDay() },
  ] as const;
  const active = presets.find((p) => p.from === value.from && p.to === value.to);
  const short = (iso: string) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  const label = active ? t(`range.${active.key}`) : value.from === value.to ? short(value.from) : `${short(value.from)} – ${short(value.to)}`;

  return (
    <div ref={box} className="relative flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-ink/80">{t("when")}</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-12 items-center gap-2.5 rounded-2xl border border-ink/12 bg-white px-4 text-[15px] font-bold transition hover:border-ink/30 sm:min-w-52"
      >
        <CalendarRange className="size-4 text-chonta" aria-hidden />
        {label}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-30 mt-2 w-[min(92vw,640px)] rounded-[28px] bg-cream p-4 shadow-2xl ring-1 ring-ink/10"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex flex-1 flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={active?.key === p.key}
                    onClick={() => {
                      onChange({ from: p.from, to: p.to });
                      setOpen(false);
                    }}
                    className="rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-ink/70 ring-1 ring-ink/10 transition hover:ring-ink/30 aria-pressed:bg-ink aria-pressed:text-brand aria-pressed:ring-ink"
                  >
                    {t(`range.${p.key}`)}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="grid size-9 place-items-center rounded-xl text-ink/50 hover:bg-white">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DatePicker label={t("from")} value={value.from} onChange={(from) => onChange({ from, to: from > value.to ? from : value.to })} />
              <DatePicker label={t("to")} value={value.to} min={value.from} onChange={(to) => onChange({ from: value.from, to })} />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink/50">
              <Clock className="size-3.5" aria-hidden /> {t("zoneHint")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
