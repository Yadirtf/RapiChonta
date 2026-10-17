import { Injectable } from '@nestjs/common';
import { Principal } from '../../identity/domain/principal';
import { BusinessErrors } from '../domain/business-config.errors';
import { MunicipalityInfo } from '../domain/ports/municipalities';
import { ScheduleException, ScheduleRepository, WeeklySlot } from '../domain/ports/schedule.repository';
import { OpeningCalendar, OpeningState, parseIsoDate } from '../domain/value-objects/opening-calendar';
import { normalizeDay, TimeSlot } from '../domain/value-objects/time-slot';
import { MunicipalityScope } from './municipality-scope';

export interface DayInput {
  weekday: number;
  slots: { opensAt: string; closesAt: string }[];
}

export interface ExceptionInput {
  date: string;
  closed: boolean;
  slots?: { opensAt: string; closesAt: string }[];
  reason?: string | null;
}

/** Hasta cuándo se listan los días especiales pasados (para que el panel muestre el festivo de ayer). */
const PAST_EXCEPTIONS_DAYS = 7;

export interface ScheduleView {
  municipality: MunicipalityInfo;
  weekly: { weekday: number; slots: TimeSlot[] }[];
  exceptions: ScheduleException[];
  state: OpeningState;
}

/**
 * Calendario vigente de un municipio. Lo usan la vista pública (botón de pedir) y la regla de E04 que
 * rechaza pedidos fuera de horario. Se cachea 30 s por municipio: se pregunta en cada carga de página.
 */
@Injectable()
export class OpeningHours {
  private readonly cache = new Map<number, { at: number; calendar: OpeningCalendar }>();

  constructor(private readonly schedule: ScheduleRepository) {}

  async calendar(municipality: MunicipalityInfo): Promise<OpeningCalendar> {
    const cached = this.cache.get(municipality.id);
    if (cached && Date.now() - cached.at < 30_000) return cached.calendar;
    const today = new OpeningCalendar(municipality.timeZone, []).localDate(new Date());
    const [slots, exceptions] = await Promise.all([this.schedule.weekly(municipality.id), this.schedule.exceptions(municipality.id, today)]);
    const calendar = new OpeningCalendar(municipality.timeZone, groupByWeekday(slots), new Map(exceptions.map((e) => [e.date, e.slots])));
    this.cache.set(municipality.id, { at: Date.now(), calendar });
    return calendar;
  }

  invalidate(municipalityId: number): void {
    this.cache.delete(municipalityId);
  }
}

@Injectable()
export class ManageScheduleUseCase {
  constructor(
    private readonly schedule: ScheduleRepository,
    private readonly scope: MunicipalityScope,
    private readonly hours: OpeningHours,
  ) {}

  async get(principal: Principal | null, municipalityId?: number, now = new Date()): Promise<ScheduleView> {
    const municipality = await this.scope.resolve(principal, municipalityId);
    const since = shiftDate(new OpeningCalendar(municipality.timeZone, []).localDate(now), -PAST_EXCEPTIONS_DAYS);
    const [slots, exceptions] = await Promise.all([this.schedule.weekly(municipality.id), this.schedule.exceptions(municipality.id, since)]);
    const weekly = groupByWeekday(slots);
    const state = new OpeningCalendar(municipality.timeZone, weekly, new Map(exceptions.map((e) => [e.date, e.slots]))).stateAt(now);
    return { municipality, weekly: weekly.map((daySlots, weekday) => ({ weekday, slots: [...daySlots] })), exceptions, state };
  }

  /** Reemplaza la semana completa: lo que no viene en `days` queda cerrado. */
  async setWeekly(principal: Principal, municipalityId: number | undefined, days: DayInput[]): Promise<ScheduleView> {
    const municipality = await this.scope.resolve(principal, municipalityId);
    const seen = new Set<number>();
    const slots: WeeklySlot[] = [];
    for (const day of days) {
      if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6 || seen.has(day.weekday)) throw BusinessErrors.invalidSlot(day.weekday ?? null);
      seen.add(day.weekday);
      slots.push(...normalizeDay(day.slots ?? [], day.weekday).map((slot) => ({ weekday: day.weekday, slot })));
    }
    await this.schedule.replaceWeekly(municipality.id, slots, principal.userId);
    this.hours.invalidate(municipality.id);
    return this.get(principal, municipality.id);
  }

  async setException(principal: Principal, municipalityId: number | undefined, input: ExceptionInput, now = new Date()): Promise<ScheduleView> {
    const municipality = await this.scope.resolve(principal, municipalityId);
    if (!parseIsoDate(input.date)) throw BusinessErrors.invalidDate();
    if (input.date < new OpeningCalendar(municipality.timeZone, []).localDate(now)) throw BusinessErrors.exceptionInPast();
    const slots = input.closed ? [] : normalizeDay(input.slots ?? []);
    if (!input.closed && !slots.length) throw BusinessErrors.invalidSlot(null);
    const reason = input.reason?.replace(/\s+/g, ' ').trim().slice(0, 120) || null;
    await this.schedule.setException(municipality.id, { date: input.date, slots, reason }, principal.userId);
    this.hours.invalidate(municipality.id);
    return this.get(principal, municipality.id, now);
  }

  async removeException(principal: Principal, municipalityId: number | undefined, date: string): Promise<ScheduleView> {
    const municipality = await this.scope.resolve(principal, municipalityId);
    if (!parseIsoDate(date)) throw BusinessErrors.invalidDate();
    if (!(await this.schedule.removeException(municipality.id, date, principal.userId))) throw BusinessErrors.exceptionNotFound();
    this.hours.invalidate(municipality.id);
    return this.get(principal, municipality.id);
  }
}

/** Estado de atención para el cliente: abierto, cuándo cierra o cuándo abre (RF-15). */
@Injectable()
export class GetBusinessStatusUseCase {
  constructor(
    private readonly scope: MunicipalityScope,
    private readonly hours: OpeningHours,
  ) {}

  async execute(municipalityId?: number, now = new Date()) {
    const municipality = await this.scope.resolve(null, municipalityId);
    const state = (await this.hours.calendar(municipality)).stateAt(now);
    return { municipality, state };
  }
}

/**
 * Regla para crear pedidos (E04, H03.2): la API rechaza el pedido fuera de horario aunque el cliente
 * lo envíe directamente. El módulo de pedidos la llama dentro de su caso de uso.
 */
@Injectable()
export class EnsureOpenForOrders {
  constructor(
    private readonly scope: MunicipalityScope,
    private readonly hours: OpeningHours,
  ) {}

  async execute(municipalityId: number, now = new Date()): Promise<void> {
    const municipality = await this.scope.resolve(null, municipalityId);
    const state = (await this.hours.calendar(municipality)).stateAt(now);
    if (!state.open) throw BusinessErrors.outsideOperatingHours(state.nextOpeningAt);
  }
}

function groupByWeekday(slots: WeeklySlot[]): TimeSlot[][] {
  const week: TimeSlot[][] = Array.from({ length: 7 }, () => []);
  for (const { weekday, slot } of slots) week[weekday].push(slot);
  week.forEach((day) => day.sort((a, b) => a.opens - b.opens));
  return week;
}

function shiftDate(date: string, days: number): string {
  const { year, month, day } = parseIsoDate(date)!;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
