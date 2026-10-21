import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { writeAudit } from '../../../shared/infrastructure/prisma/audit';
import { BUSINESS_AUDIT_ACTIONS } from '../domain/business-config.codes';
import { MunicipalityDirectory, MunicipalityInfo, MunicipalityReadiness } from '../domain/ports/municipalities';

interface Row {
  id: number;
  name: string;
  time_zone: string;
  lat: number;
  lng: number;
  launched: boolean;
}

const toInfo = (r: Row): MunicipalityInfo => ({ id: r.id, name: r.name, timeZone: r.time_zone, center: { lat: r.lat, lng: r.lng }, launched: r.launched });

@Injectable()
export class PrismaMunicipalityDirectory extends MunicipalityDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(scope: number | null): Promise<MunicipalityInfo[]> {
    const where = scope === null ? Prisma.empty : Prisma.sql`WHERE id = ${scope}`;
    return (await this.prisma.$queryRaw<Row[]>`${this.select()} ${where} ORDER BY name`).map(toInfo);
  }

  async find(id: number): Promise<MunicipalityInfo | null> {
    const [row] = await this.prisma.$queryRaw<Row[]>`${this.select()} WHERE id = ${id}`;
    return row ? toInfo(row) : null;
  }

  async readiness(ids: number[]): Promise<Map<number, MunicipalityReadiness>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.$queryRaw<{ id: number; coverage: boolean; hours: boolean; commission: boolean }[]>`
      SELECT m.id,
             EXISTS (SELECT 1 FROM delivery_zones z WHERE z.municipality_id = m.id AND z.deactivated_at IS NULL) AS coverage,
             EXISTS (SELECT 1 FROM operating_hours h WHERE h.municipality_id = m.id AND h.deactivated_at IS NULL) AS hours,
             EXISTS (SELECT 1 FROM commission_rates c WHERE c.municipality_id = m.id) AS commission
      FROM municipalities m WHERE m.id IN (${Prisma.join(ids)})`;
    return new Map(rows.map((r) => [r.id, { coverage: r.coverage, hours: r.hours, commission: r.commission }]));
  }

  async update(id: number, change: { launched?: boolean; center?: { lat: number; lng: number } }, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [before] = await tx.$queryRaw<{ launched_at: Date | null }[]>`SELECT launched_at FROM municipalities WHERE id = ${id} FOR UPDATE`;
      // Abrir conserva la fecha de apertura si ya estaba abierto; pausar la borra (vuelve a "en preparación").
      const launchedAt = change.launched === undefined ? Prisma.sql`launched_at` : change.launched ? Prisma.sql`coalesce(launched_at, now())` : Prisma.sql`NULL`;
      const center = change.center
        ? Prisma.sql`ST_SetSRID(ST_MakePoint(${change.center.lng}, ${change.center.lat}), 4326)::geography`
        : Prisma.sql`center`;
      await tx.$executeRaw`UPDATE municipalities SET launched_at = ${launchedAt}, center = ${center} WHERE id = ${id}`;
      await writeAudit(tx, {
        actorUserId,
        action: BUSINESS_AUDIT_ACTIONS.MUNICIPALITY_CHANGED,
        entityTable: 'municipalities',
        entityId: String(id),
        changes: { ...(change.launched !== undefined && { launched: { from: before?.launched_at !== null, to: change.launched } }), ...(change.center && { center: change.center }) },
      });
    });
  }

  private select() {
    return Prisma.sql`
      SELECT id, name, time_zone, ST_Y(center::geometry) AS lat, ST_X(center::geometry) AS lng,
             coalesce(launched_at <= now(), false) AS launched
      FROM municipalities`;
  }
}
