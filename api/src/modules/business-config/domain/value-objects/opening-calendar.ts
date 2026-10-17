import { TimeSlot } from './time-slot';

/** Franjas por día de la semana: índice 0 = domingo … 6 = sábado (como EXTRACT(DOW) y Date#getDay). */
export type WeeklyHours = readonly (readonly TimeSlot[])[];

/** Horario especial de una fecha local "YYYY-MM-DD": lista vacía = cerrado todo el día. */
export type DateOverrides = ReadonlyMap<string, readonly TimeSlot[]>;

export interface OpeningState {
  open: boolean;
  /** Si está abierto: cuándo cierra (une franjas seguidas, p. ej. 22:00–24:00 y 00:00–02:00). */
  closesAt: Date | null;
  /** Si está cerrado: la próxima apertura dentro de las dos semanas siguientes, o null si no hay. */
  nextOpeningAt: Date | null;
}

const LOOKAHEAD_DAYS = 14;

/**
 * Calendario de atención de un municipio (H03.2, RF-15). Las horas se interpretan en su zona horaria
 * (America/Bogota en el piloto), no en la del servidor. No usa la base de datos: se prueba con fechas fijas.
 */
export class OpeningCalendar {
  constructor(
    private readonly timeZone: string,
    private readonly weekly: WeeklyHours,
    private readonly overrides: DateOverrides = new Map(),
  ) {}

  stateAt(now: Date): OpeningState {
    const intervals = this.intervalsAround(now);
    const current = intervals.find(([start, end]) => start <= now.getTime() && now.getTime() < end);
    if (current) return { open: true, closesAt: new Date(current[1]), nextOpeningAt: null };
    const next = intervals.find(([start]) => start > now.getTime());
    return { open: false, closesAt: null, nextOpeningAt: next ? new Date(next[0]) : null };
  }

  /** Fecha local "YYYY-MM-DD" de un instante en la zona del municipio. */
  localDate(instant: Date): string {
    const { year, month, day } = zonedParts(instant, this.timeZone);
    return isoDate(year, month, day);
  }

  /** Intervalos [inicio, fin) en milisegundos desde ayer hasta dentro de dos semanas, ya unidos. */
  private intervalsAround(now: Date): [number, number][] {
    const today = zonedParts(now, this.timeZone);
    const raw: [number, number][] = [];
    for (let offset = -1; offset <= LOOKAHEAD_DAYS; offset++) {
      const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
      const [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
      const slots = this.overrides.get(isoDate(y, m, d)) ?? this.weekly[date.getUTCDay()] ?? [];
      for (const slot of slots) raw.push([zonedInstant(y, m, d, slot.opens, this.timeZone), zonedInstant(y, m, d, slot.closes, this.timeZone)]);
    }
    raw.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const interval of raw) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    return merged;
  }
}

export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "2026-12-25" → partes; null si no es una fecha real. */
export function parseIsoDate(text: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? { year, month, day } : null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function zonedParts(instant: Date, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Diferencia entre la hora local de la zona y UTC en ese instante, en milisegundos. */
function offsetAt(instant: number, timeZone: string): number {
  const p = zonedParts(new Date(instant), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Instante de "fecha local + minutos" en la zona (corrige una vez por si hay cambio de horario). */
function zonedInstant(year: number, month: number, day: number, minutes: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day) + minutes * 60_000;
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
}
