import { Injectable } from '@nestjs/common';
import { writeAudit } from '../../../shared/infrastructure/prisma/audit';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { BUSINESS_AUDIT_ACTIONS } from '../domain/business-config.codes';
import { ScheduleException, ScheduleRepository, WeeklySlot } from '../domain/ports/schedule.repository';
import { formatClock, parseClock, TimeSlot } from '../domain/value-objects/time-slot';

/** "08:00:00" (time de PostgreSQL) → franja. */
const slotOf = (opens: string, closes: string) => TimeSlot.of(parseClock(opens.slice(0, 5)), parseClock(closes.slice(0, 5)));
const key = (s: WeeklySlot) => `${s.weekday}|${s.slot.opens}|${s.slot.closes}`;

@Injectable()
export class PrismaScheduleRepository extends ScheduleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async weekly(municipalityId: number): Promise<WeeklySlot[]> {
    const rows = await this.prisma.$queryRaw<{ weekday: number; opens_at: string; closes_at: string }[]>`
      SELECT weekday, opens_at::text, closes_at::text FROM operating_hours
      WHERE municipality_id = ${municipalityId} AND deactivated_at IS NULL ORDER BY weekday, opens_at`;
    return rows.map((r) => ({ weekday: r.weekday, slot: slotOf(r.opens_at, r.closes_at) }));
  }

  async replaceWeekly(municipalityId: number, slots: WeeklySlot[], actorUserId: string): Promise<{ added: number; removed: number }> {
    return this.prisma.$transaction(async (tx) => {
      // Bloquea el municipio: dos administradores guardando a la vez no mezclan semanas.
      await tx.$executeRaw`SELECT 1 FROM municipalities WHERE id = ${municipalityId} FOR UPDATE`;
      const current = await tx.$queryRaw<{ id: string; weekday: number; opens_at: string; closes_at: string }[]>`
        SELECT id, weekday, opens_at::text, closes_at::text FROM operating_hours
        WHERE municipality_id = ${municipalityId} AND deactivated_at IS NULL`;
      const wanted = new Set(slots.map(key));
      const existing = new Map(current.map((r) => [key({ weekday: r.weekday, slot: slotOf(r.opens_at, r.closes_at) }), r.id]));
      const removed = [...existing].filter(([k]) => !wanted.has(k)).map(([, id]) => id);
      const added = slots.filter((s) => !existing.has(key(s)));
      // Primero se dan de baja (la restricción EXCLUDE solo mira las franjas activas).
      for (const id of removed) await tx.$executeRaw`UPDATE operating_hours SET deactivated_at = now() WHERE id = ${id}::uuid`;
      for (const { weekday, slot } of added) {
        await tx.$executeRaw`
          INSERT INTO operating_hours (municipality_id, weekday, opens_at, closes_at, created_by_user_id)
          VALUES (${municipalityId}, ${weekday}, ${formatClock(slot.opens)}::time, ${formatClock(slot.closes)}::time, ${actorUserId}::uuid)`;
      }
      if (removed.length || added.length) {
        await writeAudit(tx, {
          actorUserId,
          action: BUSINESS_AUDIT_ACTIONS.HOURS_CHANGED,
          entityTable: 'operating_hours',
          entityId: String(municipalityId),
          changes: {
            weekly: Array.from({ length: 7 }, (_, weekday) => ({
              weekday,
              slots: slots.filter((s) => s.weekday === weekday).map((s) => s.slot.toJSON()),
            })),
          },
        });
      }
      return { added: added.length, removed: removed.length };
    });
  }

  async exceptions(municipalityId: number, fromDate: string): Promise<ScheduleException[]> {
    const rows = await this.prisma.$queryRaw<{ on_date: string; opens_at: string | null; closes_at: string | null; reason: string | null }[]>`
      SELECT on_date::text, opens_at::text, closes_at::text, reason FROM operating_hour_exceptions
      WHERE municipality_id = ${municipalityId} AND on_date >= ${fromDate}::date
      ORDER BY on_date, opens_at NULLS FIRST LIMIT 400`;
    const byDate = new Map<string, ScheduleException>();
    for (const row of rows) {
      const entry = byDate.get(row.on_date) ?? { date: row.on_date, slots: [], reason: row.reason };
      if (row.opens_at && row.closes_at) entry.slots.push(slotOf(row.opens_at, row.closes_at));
      entry.reason ??= row.reason;
      byDate.set(row.on_date, entry);
    }
    return [...byDate.values()];
  }

  async setException(municipalityId: number, exception: ScheduleException, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM operating_hour_exceptions WHERE municipality_id = ${municipalityId} AND on_date = ${exception.date}::date`;
      if (!exception.slots.length) {
        await tx.$executeRaw`
          INSERT INTO operating_hour_exceptions (municipality_id, on_date, reason) VALUES (${municipalityId}, ${exception.date}::date, ${exception.reason})`;
      }
      for (const slot of exception.slots) {
        await tx.$executeRaw`
          INSERT INTO operating_hour_exceptions (municipality_id, on_date, opens_at, closes_at, reason)
          VALUES (${municipalityId}, ${exception.date}::date, ${formatClock(slot.opens)}::time, ${formatClock(slot.closes)}::time, ${exception.reason})`;
      }
      await writeAudit(tx, {
        actorUserId,
        action: BUSINESS_AUDIT_ACTIONS.HOURS_CHANGED,
        entityTable: 'operating_hour_exceptions',
        entityId: `${municipalityId}:${exception.date}`,
        changes: { date: exception.date, closed: !exception.slots.length, slots: exception.slots.map((s) => s.toJSON()), reason: exception.reason },
      });
    });
  }

  async removeException(municipalityId: number, date: string, actorUserId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.$executeRaw`DELETE FROM operating_hour_exceptions WHERE municipality_id = ${municipalityId} AND on_date = ${date}::date`;
      if (removed) {
        await writeAudit(tx, { actorUserId, action: BUSINESS_AUDIT_ACTIONS.HOURS_CHANGED, entityTable: 'operating_hour_exceptions', entityId: `${municipalityId}:${date}`, changes: { date, removed: true } });
      }
      return removed > 0;
    });
  }
}
