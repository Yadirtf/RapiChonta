import { BusinessErrors } from '../business-config.errors';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;
export const MINUTES_PER_DAY = 24 * 60;
/** Franjas por día: de sobra para "mañana, tarde y noche" sin que el panel se vuelva una lista infinita. */
export const MAX_SLOTS_PER_DAY = 4;

/** "08:30" → 510. "24:00" solo vale como cierre (fin del día). */
export function parseClock(text: string): number {
  const match = typeof text === 'string' ? TIME.exec(text.trim()) : null;
  if (!match) throw BusinessErrors.invalidTime();
  return text.trim() === '24:00' ? MINUTES_PER_DAY : Number(match[1]) * 60 + Number(match[2]);
}

export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Franja de atención dentro de un día, en minutos desde la medianoche local [opens, closes).
 * Una franja que cruza la medianoche se registra como dos (CHECK closes_at > opens_at en la base).
 */
export class TimeSlot {
  private constructor(
    readonly opens: number,
    readonly closes: number,
  ) {}

  static of(opens: number, closes: number, weekday: number | null = null): TimeSlot {
    if (!Number.isInteger(opens) || !Number.isInteger(closes) || opens < 0 || closes > MINUTES_PER_DAY || closes <= opens) {
      throw BusinessErrors.invalidSlot(weekday);
    }
    return new TimeSlot(opens, closes);
  }

  static parse(input: { opensAt: string; closesAt: string }, weekday: number | null = null): TimeSlot {
    const opens = parseClock(input.opensAt);
    if (opens === MINUTES_PER_DAY) throw BusinessErrors.invalidSlot(weekday);
    return TimeSlot.of(opens, parseClock(input.closesAt), weekday);
  }

  toJSON() {
    return { opensAt: formatClock(this.opens), closesAt: formatClock(this.closes) };
  }
}

/** Ordena y valida las franjas de un día: máximo 4 y sin cruces (la base lo vuelve a exigir con EXCLUDE). */
export function normalizeDay(slots: readonly { opensAt: string; closesAt: string }[], weekday: number | null = null): TimeSlot[] {
  if (slots.length > MAX_SLOTS_PER_DAY) throw BusinessErrors.tooManySlots(MAX_SLOTS_PER_DAY);
  const parsed = slots.map((s) => TimeSlot.parse(s, weekday)).sort((a, b) => a.opens - b.opens);
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].opens < parsed[i - 1].closes) throw BusinessErrors.overlappingSlots(weekday);
  }
  return parsed;
}
