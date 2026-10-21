"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock3, Moon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
/** Las 24 horas en cuatro tramos de seis, como se piensa el día de un local. */
const PERIODS = [
  { key: "dawn", from: 0 },
  { key: "morning", from: 6 },
  { key: "afternoon", from: 12 },
  { key: "evening", from: 18 },
] as const;
const POPOVER_WIDTH = 304;
const END_OF_DAY = "24:00";

const noop = () => () => {};
const isClient = () => true;
const isServer = () => false;

const pad = (n: number) => String(n).padStart(2, "0");
const parse = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
};

/** Hora en el formato del idioma ("8:00 a. m." / "8:00 AM"), sin depender de la zona del navegador. */
function useClockFormat() {
  const locale = useLocale();
  const tag = locale === "en" ? "en-US" : "es-CO";
  return (h: number, m: number | null) =>
    new Intl.DateTimeFormat(tag, { hour: "numeric", minute: m === null ? undefined : "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, h, m ?? 0)));
}

interface TimePickerProps {
  /** "HH:MM"; con `endOfDay`, "24:00" es medianoche (fin del día). */
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Hora de cierre: ofrece "medianoche" como fin del día. */
  endOfDay?: boolean;
}

/**
 * Selector de hora propio (en lugar de `<input type="time">`): un botón con la hora y una tarjeta con las horas
 * agrupadas por tramo del día y los minutos de 5 en 5. El selector nativo hacía caer la pestaña en Chrome
 * para Windows (STATUS_ACCESS_VIOLATION) al abrir la página de horario.
 */
export function TimePicker({ value, onChange, label, endOfDay = false }: TimePickerProps) {
  const t = useTranslations("pickers");
  const clock = useClockFormat();
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(noop, isClient, isServer);
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean } | null>(null);

  const midnight = endOfDay && value === END_OF_DAY;
  const { h, m } = midnight ? { h: 0, m: 0 } : parse(value);
  const minutes = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort((a, b) => a - b);

  // Tarjeta flotante en un portal: dentro de un diálogo con scroll no se recorta.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const height = card.current?.offsetHeight ?? 360;
      const above = rect.bottom + height + 12 > window.innerHeight && rect.top > height + 12;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - POPOVER_WIDTH - 8);
      setPosition({ top: above ? rect.top - height - 8 : rect.bottom + 8, left, above });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!card.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    // Captura en window: Escape cierra solo la tarjeta, no el diálogo que la contiene.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    const focusTimer = window.setTimeout(() => card.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.focus(), 30);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const pick = (hour: number, minute: number) => onChange(`${pad(hour)}:${pad(minute)}`);
  const done = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`${label}: ${midnight ? t("midnight") : clock(h, m)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-sm font-bold tabular-nums whitespace-nowrap transition hover:bg-white focus-visible:ring-2 focus-visible:ring-chonta focus-visible:outline-none ${open ? "bg-white ring-2 ring-brand" : ""}`}
      >
        {midnight ? (
          <>
            <Moon className="size-3.5 text-chonta-strong" aria-hidden /> {t("midnight")}
          </>
        ) : (
          clock(h, m)
        )}
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={card}
                role="dialog"
                aria-label={label}
                initial={{ opacity: 0, y: position?.above ? 6 : -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                style={{ top: position?.top ?? -9999, left: position?.left ?? 0, width: POPOVER_WIDTH }}
                className="fixed z-[60] overflow-hidden rounded-3xl bg-white text-ink shadow-2xl ring-1 ring-ink/10"
              >
                <div className="flex items-center gap-2 bg-ink px-4 py-3 text-white">
                  <Clock3 className="size-4 text-brand" aria-hidden />
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold text-white/70">{label}</p>
                  <p className="font-display text-lg font-extrabold tabular-nums text-brand">{midnight ? t("midnight") : clock(h, m)}</p>
                </div>

                <div className="flex flex-col gap-2 p-3">
                  <p className="px-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink/40">{t("hour")}</p>
                  {PERIODS.map((period) => (
                    <div key={period.key} className="flex items-center gap-1.5">
                      <span className="w-16 shrink-0 px-1 text-[11px] font-bold text-ink/45">{t(`periods.${period.key}`)}</span>
                      <div className="grid flex-1 grid-cols-6 gap-1">
                        {Array.from({ length: 6 }, (_, i) => period.from + i).map((hour) => {
                          const selected = !midnight && hour === h;
                          return (
                            <button
                              key={hour}
                              type="button"
                              aria-pressed={selected}
                              aria-label={clock(hour, null)}
                              onClick={() => pick(hour, midnight ? 0 : m)}
                              className={`h-8 rounded-lg text-xs font-bold tabular-nums transition focus-visible:ring-2 focus-visible:ring-chonta focus-visible:outline-none ${selected ? "bg-brand text-ink shadow-sm" : "text-ink/70 hover:bg-cream"}`}
                            >
                              {hour % 12 === 0 ? 12 : hour % 12}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <p className="mt-1 px-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink/40">{t("minutes")}</p>
                  <div className="grid grid-cols-6 gap-1">
                    {minutes.map((minute) => {
                      const selected = !midnight && minute === m;
                      return (
                        <button
                          key={minute}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => pick(h, minute)}
                          className={`h-8 rounded-lg text-xs font-bold tabular-nums transition focus-visible:ring-2 focus-visible:ring-chonta focus-visible:outline-none ${selected ? "bg-chonta text-white shadow-sm" : "text-ink/70 hover:bg-cream"}`}
                        >
                          :{pad(minute)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-1 flex items-center gap-2">
                    {endOfDay && (
                      <button
                        type="button"
                        aria-pressed={midnight}
                        onClick={() => onChange(END_OF_DAY)}
                        className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-chonta focus-visible:outline-none ${midnight ? "bg-ink text-brand" : "bg-ink/5 text-ink/70 hover:bg-ink/10"}`}
                      >
                        <Moon className="size-3.5" aria-hidden /> {t("endOfDay")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={done}
                      className="inline-flex h-9 flex-1 items-center justify-center rounded-xl bg-leaf text-xs font-bold text-white transition hover:bg-leaf/90 focus-visible:ring-2 focus-visible:ring-leaf/40 focus-visible:outline-none"
                    >
                      {t("done")}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
