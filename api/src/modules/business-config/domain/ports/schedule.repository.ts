import { TimeSlot } from '../value-objects/time-slot';

export interface WeeklySlot {
  weekday: number;
  slot: TimeSlot;
}

export interface ScheduleException {
  /** Fecha local "YYYY-MM-DD". */
  date: string;
  /** Vacío = cerrado todo el día. */
  slots: TimeSlot[];
  reason: string | null;
}

/** Horario de operación por municipio (operating_hours) y días especiales (operating_hour_exceptions). */
export abstract class ScheduleRepository {
  abstract weekly(municipalityId: number): Promise<WeeklySlot[]>;
  /** Da de baja las franjas que ya no están y crea las nuevas; las que no cambian se conservan. */
  abstract replaceWeekly(municipalityId: number, slots: WeeklySlot[], actorUserId: string): Promise<{ added: number; removed: number }>;
  abstract exceptions(municipalityId: number, fromDate: string): Promise<ScheduleException[]>;
  abstract setException(municipalityId: number, exception: ScheduleException, actorUserId: string): Promise<void>;
  abstract removeException(municipalityId: number, date: string, actorUserId: string): Promise<boolean>;
}
