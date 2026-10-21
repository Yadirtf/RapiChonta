"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

/** "YYYY-MM-DD" ↔ fecha a mediodía UTC: el día no cambia con la zona horaria del navegador. */
const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return toIso(d);
};

interface DatePickerProps {
  label: string;
  /** "YYYY-MM-DD". */
  value: string;
  min?: string;
  onChange: (value: string) => void;
}

/**
 * Calendario de un mes, siempre visible (en lugar de `<input type="date">`), con la semana de lunes a domingo
 * y los días anteriores a `min` deshabilitados.
 */
export function DatePicker({ label, value, min, onChange }: DatePickerProps) {
  const t = useTranslations("pickers");
  const locale = useLocale();
  const tag = locale === "en" ? "en-US" : "es-CO";
  const [month, setMonth] = useState(() => monthStart(value || min || toIso(new Date())));

  const first = toDate(month);
  // Lunes = 0 … domingo = 6.
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`);
  const canGoBack = !min || month > monthStart(min);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(tag, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 19 + i, 12))));
  const monthName = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const title = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const full = (iso: string) => new Intl.DateTimeFormat(tag, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(toDate(iso));

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-ink/80">{label}</p>
      <div className="rounded-3xl bg-white p-3 ring-1 ring-ink/10">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            disabled={!canGoBack}
            aria-label={t("previousMonth")}
            className="grid size-9 place-items-center rounded-xl text-ink/60 transition hover:bg-ink/5 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p className="flex-1 text-center font-display font-extrabold" aria-live="polite">
            {title}
          </p>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label={t("nextMonth")}
            className="grid size-9 place-items-center rounded-xl text-ink/60 transition hover:bg-ink/5"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((d, i) => (
            <span key={i} className="pb-1 text-[11px] font-extrabold uppercase text-ink/35" aria-hidden>
              {d}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`pad-${i}`} aria-hidden />
          ))}
          {days.map((iso) => {
            const selected = iso === value;
            const disabled = !!min && iso < min;
            const today = iso === min;
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={full(iso)}
                onClick={() => onChange(iso)}
                className={`relative h-9 rounded-xl text-sm font-bold tabular-nums transition focus-visible:ring-2 focus-visible:ring-chonta focus-visible:outline-none disabled:text-ink/20 ${
                  selected ? "bg-chonta text-white shadow-sm" : disabled ? "" : "text-ink/75 hover:bg-cream"
                } ${today && !selected ? "ring-1 ring-brand" : ""}`}
              >
                {Number(iso.slice(8))}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
