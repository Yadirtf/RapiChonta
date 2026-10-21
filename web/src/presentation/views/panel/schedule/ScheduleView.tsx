"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarOff, CalendarPlus, Clock3, Copy, Plus, Trash2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { clockToMinutes, dayProblem, type Schedule, type ScheduleException, type TimeSlot } from "@/core/domain/entities/business";
import { container } from "@/infrastructure/di/container";
import { useOpeningText } from "../../../business/BusinessProvider";
import { PageHeader } from "../../../components/panel/PageHeader";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { DatePicker } from "../../../components/ui/DatePicker";
import { Dialog } from "../../../components/ui/Dialog";
import { TextField } from "../../../components/ui/Field";
import { TimePicker } from "../../../components/ui/TimePicker";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";
import { usePanelMunicipality } from "../PanelMunicipality";

/** La semana se muestra de lunes a domingo; la API numera 0 = domingo. */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
const WORKDAYS = [1, 2, 3, 4, 5];
const DEFAULT_SLOT: TimeSlot = { opensAt: "08:00", closesAt: "18:00" };

type Week = Record<number, TimeSlot[]>;

const toWeek = (schedule: Schedule): Week => Object.fromEntries(WEEK.map((d) => [d, schedule.weekly.find((w) => w.weekday === d)?.slots ?? []]));
const sameWeek = (a: Week, b: Week) => WEEK.every((d) => JSON.stringify(a[d]) === JSON.stringify(b[d]));

/** Fecha local "YYYY-MM-DD" en la zona horaria del municipio. */
const localToday = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/**
 * Horario de atención (H03.2): la semana como el cartel de horario pegado en la puerta, con varias franjas
 * por día, y los días especiales (festivos, cierres) que mandan sobre la semana.
 */
export function ScheduleView() {
  const t = useTranslations("schedule");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const openingText = useOpeningText();
  const options = useResource(() => container.businessAdmin.options(), []);
  const { municipalityId } = usePanelMunicipality();
  const { data, error, loading, setData } = useResource(() => container.businessAdmin.schedule(municipalityId), [municipalityId]);
  const maxSlots = options.data?.limits.slotsPerDay ?? 4;

  const [week, setWeek] = useState<Week | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [addingException, setAddingException] = useState(false);

  // La semana editable se reinicia cada vez que llega un horario nuevo de la API (al cargar o al guardar).
  const [loaded, setLoaded] = useState(data);
  if (data !== loaded) {
    setLoaded(data);
    if (data) setWeek(toWeek(data));
  }

  const original = useMemo(() => (data ? toWeek(data) : null), [data]);
  const dirty = !!week && !!original && !sameWeek(week, original);
  const problems = useMemo(() => (week ? Object.fromEntries(WEEK.map((d) => [d, dayProblem(week[d])])) : {}), [week]);
  const invalid = Object.values(problems).some(Boolean);

  // Nombre del día según el idioma: 2026-10-18 fue domingo.
  const dayName = (weekday: number, style: "long" | "short" = "long") =>
    format.dateTime(new Date(Date.UTC(2026, 9, 18 + weekday, 12)), {
      weekday: style,
      timeZone: "UTC",
    });

  const setDay = (weekday: number, slots: TimeSlot[]) => setWeek((w) => (w ? { ...w, [weekday]: slots } : w));
  const copyTo = (from: number, targets: number[]) =>
    setWeek((w) =>
      w
        ? {
            ...w,
            ...Object.fromEntries(targets.map((d) => [d, w[from].map((s) => ({ ...s }))])),
          }
        : w,
    );

  const save = async () => {
    if (!week) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await container.businessAdmin.setWeekly(WEEK.map((weekday) => ({ weekday, slots: week[weekday] })), municipalityId);
      setData(next);
      setSavedAt(Date.now());
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const removeException = async (date: string) => {
    try {
      setData(await container.businessAdmin.removeException(date, municipalityId));
    } catch (e) {
      setSaveError(e);
    }
  };

  const status = data ? openingText({ ...data.status, municipality: data.municipality }) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-32 sm:px-8 sm:py-10">
      <PageHeader
        title={t("title")}
        subtitle={data ? t("subtitle", { municipality: data.municipality.name }) : undefined}
        action={
          status && (
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-ink/5" role="status">
              <span className="door-sign shrink-0">
                <span className={`block rounded-lg px-2.5 py-1 font-display text-[11px] font-extrabold uppercase tracking-[0.12em] text-white ${status.tone === "open" ? "bg-leaf" : "bg-chonta"}`}>
                  {status.title}
                </span>
              </span>
              <span className="text-sm font-semibold text-ink/70">{status.detail}</span>
            </div>
          )
        }
      />

      {error ? <Alert>{errorMessage(error)}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Semana */}
        <section aria-labelledby="week-title" className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-ink/5">
          <div className="awning awning-sm h-4" aria-hidden />
          <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-7 pb-3">
            <div>
              <h2 id="week-title" className="font-display text-xl font-extrabold tracking-tight">
                {t("weekTitle")}
              </h2>
              <p className="text-sm text-ink/55">
                {t("weekHint", {
                  timeZone: data?.municipality.timeZone ?? "America/Bogota",
                })}
              </p>
            </div>
          </div>

          {loading && !week ? (
            <div className="flex flex-col gap-2 p-5">
              {WEEK.map((d) => (
                <div key={d} className="h-16 animate-pulse rounded-2xl bg-ink/5" />
              ))}
            </div>
          ) : week ? (
            <ul className="divide-y divide-dashed divide-ink/10">
              {WEEK.map((weekday, index) => (
                <DayRow
                  key={weekday}
                  scale={index === 0}
                  name={dayName(weekday)}
                  short={dayName(weekday, "short")}
                  slots={week[weekday]}
                  maxSlots={maxSlots}
                  problem={problems[weekday] ?? null}
                  onChange={(slots) => setDay(weekday, slots)}
                  onCopyWorkdays={() =>
                    copyTo(
                      weekday,
                      WORKDAYS.filter((d) => d !== weekday),
                    )
                  }
                  onCopyAll={() =>
                    copyTo(
                      weekday,
                      WEEK.filter((d) => d !== weekday),
                    )
                  }
                />
              ))}
            </ul>
          ) : null}
        </section>

        {/* Días especiales */}
        <section aria-labelledby="exceptions-title" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 id="exceptions-title" className="font-display text-xl font-extrabold tracking-tight">
                {t("exceptionsTitle")}
              </h2>
              <p className="text-sm text-ink/55">{t("exceptionsHint")}</p>
            </div>
            <Button size="sm" variant="dark" onClick={() => setAddingException(true)} disabled={!data}>
              <CalendarPlus className="size-4" aria-hidden /> {t("addException")}
            </Button>
          </div>
          {data && !data.exceptions.length ? (
            <div className="rounded-3xl border-2 border-dashed border-ink/10 p-6 text-center text-sm text-ink/50">{t("noExceptions")}</div>
          ) : (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {(data?.exceptions ?? []).map((exception) => (
                  <ExceptionItem key={exception.date} exception={exception} onRemove={() => void removeException(exception.date)} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </div>

      {/* Barra para guardar la semana */}
      <AnimatePresence>
        {(dirty || saveError || savedAt) && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-3xl bg-ink p-3 pl-5 text-white shadow-2xl lg:left-[calc(16rem+0.75rem)]"
            role="status"
          >
            <p className="min-w-0 flex-1 text-sm">
              {saveError ? <span className="font-semibold text-chonta-soft">{errorMessage(saveError)}</span> : dirty ? invalid ? t("fixProblems") : t("unsaved") : t("saved")}
            </p>
            {dirty ? (
              <>
                <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={() => original && setWeek(original)}>
                  {t("discard")}
                </Button>
                <Button size="sm" loading={saving} disabled={invalid} onClick={() => void save()}>
                  {t("save")}
                </Button>
              </>
            ) : (
              <button className="grid size-8 place-items-center rounded-xl text-white/60 hover:bg-white/10" aria-label={t("dismiss")} onClick={() => (setSavedAt(null), setSaveError(null))}>
                <X className="size-4" aria-hidden />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {data && (
        <ExceptionDialog
          open={addingException}
          minDate={localToday(data.municipality.timeZone)}
          maxSlots={maxSlots}
          onClose={() => setAddingException(false)}
          onSaved={(next) => {
            setData(next);
            setAddingException(false);
          }}
        />
      )}
    </div>
  );
}

/** Franjas del día pintadas sobre 24 h: el día se lee de un vistazo. */
function Timeline({ slots, closed, scale = false }: { slots: TimeSlot[]; closed: boolean; scale?: boolean }) {
  return (
    <div className="w-full max-w-[320px]" aria-hidden>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink/[0.06]">
        {[6, 12, 18].map((h) => (
          <span key={h} className="absolute inset-y-0 w-px bg-ink/10" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        {!closed &&
          slots.map((s, i) => {
            const from = clockToMinutes(s.opensAt);
            const to = clockToMinutes(s.closesAt);
            if (!(to > from)) return null;
            return (
              <span
                key={i}
                className="absolute inset-y-0 rounded-full bg-gradient-to-r from-brand to-chonta"
                style={{
                  left: `${(from / 1440) * 100}%`,
                  width: `${((to - from) / 1440) * 100}%`,
                }}
              />
            );
          })}
      </div>
      {scale && (
        <div className="mt-1 flex justify-between text-[10px] font-semibold tabular-nums text-ink/35">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h}>{h}h</span>
          ))}
        </div>
      )}
    </div>
  );
}

interface DayRowProps {
  scale: boolean;
  name: string;
  short: string;
  slots: TimeSlot[];
  maxSlots: number;
  problem: "INVALID_TIME_SLOT" | "OVERLAPPING_TIME_SLOTS" | null;
  onChange: (slots: TimeSlot[]) => void;
  onCopyWorkdays: () => void;
  onCopyAll: () => void;
}

function DayRow({ scale, name, short, slots, maxSlots, problem, onChange, onCopyWorkdays, onCopyAll }: DayRowProps) {
  const t = useTranslations("schedule");
  const open = slots.length > 0;
  const [copying, setCopying] = useState(false);

  return (
    <li className={`relative flex flex-col gap-3 px-5 py-4 transition-colors sm:flex-row sm:items-start ${open ? "" : "bg-ink/[0.02]"}`}>
      <div className="flex items-center gap-3 sm:w-44 sm:pt-1.5">
        <Switch checked={open} label={t("openToggle", { day: name })} onChange={(on) => onChange(on ? [{ ...DEFAULT_SLOT }] : [])} />
        <div className="min-w-0">
          <p className="font-bold capitalize">{name}</p>
          {!open && <p className="text-xs font-semibold text-chonta-strong">{t("closedDay")}</p>}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {open && <SlotsEditor slots={slots} maxSlots={maxSlots} dayLabel={short} onChange={onChange} />}
        <Timeline slots={slots} closed={!open} scale={scale} />
        {problem && (
          <p className="text-xs font-semibold text-red-600" role="alert">
            {t(`problems.${problem}`)}
          </p>
        )}
      </div>

      {open && (
        <div className="absolute top-4 right-4 flex shrink-0 justify-end sm:relative sm:top-auto sm:right-auto sm:pt-1">
          <button
            onClick={() => setCopying((c) => !c)}
            aria-expanded={copying}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-ink/55 hover:bg-ink/5 hover:text-ink"
          >
            <Copy className="size-3.5" aria-hidden /> {t("copy")}
          </button>
          {copying && (
            <div className="absolute right-0 top-10 z-10 flex w-52 flex-col rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-ink/10" onMouseLeave={() => setCopying(false)}>
              <button className="rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-cream" onClick={() => (onCopyWorkdays(), setCopying(false))}>
                {t("copyWorkdays")}
              </button>
              <button className="rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-cream" onClick={() => (onCopyAll(), setCopying(false))}>
                {t("copyAll")}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Franjas editables. El cierre "24:00" es medianoche (fin del día). */
function SlotsEditor({ slots, maxSlots, dayLabel, onChange }: { slots: TimeSlot[]; maxSlots: number; dayLabel: string; onChange: (slots: TimeSlot[]) => void }) {
  const t = useTranslations("schedule");
  const update = (index: number, patch: Partial<TimeSlot>) => onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const addSlot = () => {
    const last = slots[slots.length - 1];
    const start = last ? Math.min(clockToMinutes(last.closesAt) + 60, 22 * 60) : 8 * 60;
    const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    onChange([...slots, { opensAt: clock(start), closesAt: clock(Math.min(start + 120, 1440)) }]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {slots.map((slot, index) => (
        <div key={index} className="inline-flex items-center gap-1 rounded-2xl bg-cream py-1 pr-1 pl-2 ring-1 ring-brand/40">
          <Clock3 className="size-3.5 text-chonta-strong" aria-hidden />
          <TimePicker value={slot.opensAt} label={t("opensAt", { day: dayLabel, n: index + 1 })} onChange={(opensAt) => update(index, { opensAt })} />
          <span className="text-ink/40" aria-hidden>
            –
          </span>
          <TimePicker value={slot.closesAt} endOfDay label={t("closesAt", { day: dayLabel, n: index + 1 })} onChange={(closesAt) => update(index, { closesAt })} />
          {slots.length > 1 && (
            <button
              onClick={() => onChange(slots.filter((_, i) => i !== index))}
              className="grid size-7 place-items-center rounded-lg text-ink/40 hover:bg-white hover:text-red-600"
              aria-label={t("removeSlot")}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      ))}
      {slots.length < maxSlots && (
        <button
          onClick={addSlot}
          className="inline-flex h-9 items-center gap-1 rounded-2xl border border-dashed border-ink/20 px-3 text-xs font-bold text-ink/60 hover:border-chonta hover:text-chonta-strong"
        >
          <Plus className="size-3.5" aria-hidden /> {t("addSlot")}
        </button>
      )}
    </div>
  );
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:ring-4 focus-visible:ring-leaf/30 ${checked ? "bg-leaf" : "bg-ink/15"}`}
    >
      <span className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

function ExceptionItem({ exception, onRemove }: { exception: ScheduleException; onRemove: () => void }) {
  const t = useTranslations("schedule");
  const format = useFormatter();
  const date = new Date(`${exception.date}T12:00:00Z`);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-ink/5"
    >
      {/* Hoja de calendario de pared */}
      <span className="flex w-14 shrink-0 flex-col overflow-hidden rounded-2xl text-center ring-1 ring-ink/10">
        <span className={`py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white ${exception.closed ? "bg-chonta" : "bg-leaf"}`}>
          {format.dateTime(date, { month: "short", timeZone: "UTC" })}
        </span>
        <span className="py-1 font-display text-xl font-extrabold leading-none tabular-nums">{format.dateTime(date, { day: "numeric", timeZone: "UTC" })}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold capitalize">{format.dateTime(date, { weekday: "long", timeZone: "UTC" })}</p>
        <p className="truncate text-xs text-ink/60">
          {exception.closed ? (
            <span className="font-semibold text-chonta-strong">{t("closedAllDay")}</span>
          ) : (
            exception.slots.map((s) => `${s.opensAt}–${s.closesAt === "24:00" ? "00:00" : s.closesAt}`).join(" · ")
          )}
          {exception.reason ? ` · ${exception.reason}` : ""}
        </p>
      </div>
      <button onClick={onRemove} className="grid size-9 place-items-center rounded-xl text-ink/40 hover:bg-red-50 hover:text-red-600" aria-label={t("removeException")}>
        <Trash2 className="size-4" aria-hidden />
      </button>
    </motion.li>
  );
}

function ExceptionDialog({ open, minDate, maxSlots, onClose, onSaved }: { open: boolean; minDate: string; maxSlots: number; onClose: () => void; onSaved: (s: Schedule) => void }) {
  const { municipalityId } = usePanelMunicipality();
  const t = useTranslations("schedule");
  const errorMessage = useErrorMessage();
  const [date, setDate] = useState(minDate);
  const [closed, setClosed] = useState(true);
  const [slots, setSlots] = useState<TimeSlot[]>([{ opensAt: "09:00", closesAt: "13:00" }]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Cada vez que se abre, el formulario empieza de cero.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(minDate);
      setClosed(true);
      setSlots([{ opensAt: "09:00", closesAt: "13:00" }]);
      setReason("");
      setError(null);
    }
  }

  const problem = closed ? null : dayProblem(slots);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await container.businessAdmin.setException(date, {
          closed,
          slots: closed ? [] : slots,
          reason: reason.trim() || null,
        }, municipalityId),
      );
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("exceptionTitle")} description={t("exceptionBody")} closeLabel={t("cancel")}>
      <div className="flex flex-col gap-4">
        <DatePicker label={t("date")} min={minDate} value={date} onChange={setDate} />
        <div role="radiogroup" aria-label={t("exceptionKind")} className="grid grid-cols-2 gap-2">
          {[
            {
              value: true,
              icon: CalendarOff,
              label: t("closedAllDay"),
              tone: "bg-chonta-soft ring-2 ring-chonta",
            },
            {
              value: false,
              icon: Clock3,
              label: t("specialHours"),
              tone: "bg-leaf/10 ring-2 ring-leaf",
            },
          ].map(({ value, icon: Icon, label, tone }) => (
            <button
              key={String(value)}
              role="radio"
              aria-checked={closed === value}
              onClick={() => setClosed(value)}
              className={`flex items-center gap-2 rounded-2xl p-3 text-left text-sm font-bold ring-1 transition ${closed === value ? tone : "ring-ink/10 hover:bg-ink/[0.03]"}`}
            >
              <Icon className="size-4.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
        {!closed && (
          <div className="flex flex-col gap-2">
            <SlotsEditor slots={slots} maxSlots={maxSlots} dayLabel={date} onChange={setSlots} />
            <Timeline slots={slots} closed={false} />
            {problem && <p className="text-xs font-semibold text-red-600">{t(`problems.${problem}`)}</p>}
          </div>
        )}
        <TextField label={t("reason")} placeholder={t("reasonPlaceholder")} maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <Button block size="lg" loading={saving} disabled={!date || !!problem || (!closed && !slots.length)} onClick={() => void save()}>
          {t("saveException")}
        </Button>
      </div>
    </Dialog>
  );
}
