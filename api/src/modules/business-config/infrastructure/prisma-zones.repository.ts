import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAudit } from '../../../shared/infrastructure/prisma/audit';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { GeoPolygon } from '../../catalog/domain/value-objects/geo-polygon';
import { pointSql, polygonSql } from '../../catalog/infrastructure/persistence/sql';
import { BUSINESS_AUDIT_ACTIONS, ZoneKindCode } from '../domain/business-config.codes';
import { DeliveryQuote, FeeChange, ZoneData, ZoneOverlap, ZoneRecord, ZonesRepository } from '../domain/ports/zones.repository';

type Tx = Prisma.TransactionClient;

interface ZoneRow {
  id: string;
  municipality_id: number;
  name: string;
  kind: ZoneKindCode;
  ring: [number, number][];
  area_m2: number;
  fee: string;
  fee_since: Date;
  sort_order: number;
  created_at: Date;
}

const ZONE_SELECT = Prisma.sql`
  SELECT z.id, z.municipality_id, z.name, k.code AS kind, z.sort_order, z.created_at,
         ST_AsGeoJSON(z.area::geometry, 7)::json -> 'coordinates' -> 0 AS ring, ST_Area(z.area) AS area_m2,
         f.amount::text AS fee, f.created_at AS fee_since
  FROM delivery_zones z
  JOIN zone_kinds k ON k.id = z.zone_kind_id
  JOIN v_current_zone_fees f ON f.delivery_zone_id = z.id`;

const toRecord = (r: ZoneRow): ZoneRecord => ({
  id: r.id,
  municipalityId: r.municipality_id,
  name: r.name,
  kind: r.kind,
  // El anillo de PostGIS viene cerrado (último = primero); el editor trabaja con vértices únicos.
  area: r.ring.slice(0, -1),
  areaSquareMeters: Math.round(r.area_m2),
  fee: r.fee,
  feeSince: r.fee_since,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
});

/** Piezas con superficie (≥ 50 m²) que quedan de `area` al quitarle las zonas activas del municipio. */
function trimmedPieces(municipalityId: number, area: GeoPolygon, exceptId?: string) {
  return Prisma.sql`
    others AS (
      SELECT ST_Union(z.area::geometry) AS g FROM delivery_zones z
      WHERE z.municipality_id = ${municipalityId} AND z.deactivated_at IS NULL
        AND (${exceptId ?? null}::uuid IS NULL OR z.id <> ${exceptId ?? null}::uuid)
    ), cut AS (
      SELECT ST_CollectionExtract(ST_MakeValid(coalesce(ST_Difference(${polygonSql(area)}::geometry, o.g), ${polygonSql(area)}::geometry)), 3) AS g
      FROM others o
    ), pieces AS (
      SELECT d.geom AS g FROM cut, ST_Dump(cut.g) d WHERE ST_Area(d.geom::geography) >= 50
    )`;
}

/** Superficie mínima compartida para contar como superposición (redondeos del dibujo no cuentan). */
const OVERLAP_TOLERANCE_M2 = 1;

@Injectable()
export class PrismaZonesRepository extends ZonesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(municipalityId: number): Promise<ZoneRecord[]> {
    const rows = await this.prisma.$queryRaw<ZoneRow[]>`
      ${ZONE_SELECT} WHERE z.municipality_id = ${municipalityId} AND z.deactivated_at IS NULL ORDER BY z.sort_order, z.name`;
    return rows.map(toRecord);
  }

  async find(id: string): Promise<ZoneRecord | null> {
    const [row] = await this.prisma.$queryRaw<ZoneRow[]>`${ZONE_SELECT} WHERE z.id = ${id}::uuid AND z.deactivated_at IS NULL`;
    return row ? toRecord(row) : null;
  }

  async nameTaken(municipalityId: number, name: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ taken: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM delivery_zones WHERE municipality_id = ${municipalityId} AND deactivated_at IS NULL
                     AND lower(name) = lower(${name}) AND (${exceptId ?? null}::uuid IS NULL OR id <> ${exceptId ?? null}::uuid)) AS taken`;
    return row.taken;
  }

  async overlaps(municipalityId: number, area: GeoPolygon, exceptId?: string): Promise<ZoneOverlap[]> {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; m2: number }[]>`
      SELECT z.id, z.name, ST_Area(ST_Intersection(z.area::geometry, a.g)::geography) AS m2
      FROM delivery_zones z, (SELECT ${polygonSql(area)}::geometry AS g) a
      WHERE z.municipality_id = ${municipalityId} AND z.deactivated_at IS NULL
        AND (${exceptId ?? null}::uuid IS NULL OR z.id <> ${exceptId ?? null}::uuid)
        AND ST_Intersects(z.area::geometry, a.g)
      ORDER BY m2 DESC`;
    return rows.filter((r) => r.m2 >= OVERLAP_TOLERANCE_M2).map((r) => ({ id: r.id, name: r.name, overlapSquareMeters: Math.round(r.m2) }));
  }

  async trim(municipalityId: number, area: GeoPolygon, exceptId?: string): Promise<[number, number][] | 'EMPTY' | 'SPLIT'> {
    const [row] = await this.prisma.$queryRaw<{ parts: number; ring: [number, number][] | null }[]>`
      WITH ${trimmedPieces(municipalityId, area, exceptId)}
      SELECT count(*)::int AS parts,
             CASE WHEN count(*) = 1 THEN ST_AsGeoJSON(ST_ExteriorRing(min(g)), 7)::json -> 'coordinates' END AS ring
      FROM pieces`;
    if (row.parts === 0) return 'EMPTY';
    if (row.parts > 1) return 'SPLIT';
    return row.ring!.slice(0, -1);
  }

  async create(municipalityId: number, data: ZoneData, actorUserId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const id = await this.insertZone(tx, municipalityId, data, actorUserId);
      await writeAudit(tx, { actorUserId, action: BUSINESS_AUDIT_ACTIONS.ZONE_CHANGED, entityTable: 'delivery_zones', entityId: id, changes: { created: { name: data.name, kind: data.kind, fee: data.fee } } });
      return id;
    });
  }

  async replace(id: string, data: ZoneData, actorUserId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const [old] = await tx.$queryRaw<{ municipality_id: number; sort_order: number }[]>`
        UPDATE delivery_zones SET deactivated_at = now() WHERE id = ${id}::uuid AND deactivated_at IS NULL
        RETURNING municipality_id, sort_order`;
      if (!old) throw new Prisma.PrismaClientKnownRequestError('Zona no encontrada', { code: 'P2025', clientVersion: Prisma.prismaVersion.client });
      const newId = await this.insertZone(tx, old.municipality_id, data, actorUserId, old.sort_order);
      await writeAudit(tx, { actorUserId, action: BUSINESS_AUDIT_ACTIONS.ZONE_CHANGED, entityTable: 'delivery_zones', entityId: newId, changes: { replaces: id, name: data.name, kind: data.kind, fee: data.fee } });
      return newId;
    });
  }

  async rename(id: string, name: string, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [before] = await tx.$queryRaw<{ name: string }[]>`SELECT name FROM delivery_zones WHERE id = ${id}::uuid FOR UPDATE`;
      await tx.$executeRaw`UPDATE delivery_zones SET name = ${name} WHERE id = ${id}::uuid`;
      await writeAudit(tx, { actorUserId, action: BUSINESS_AUDIT_ACTIONS.ZONE_CHANGED, entityTable: 'delivery_zones', entityId: id, changes: { name: { from: before?.name, to: name } } });
    });
  }

  async changeFee(id: string, fee: string, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [before] = await tx.$queryRaw<{ amount: string }[]>`SELECT amount::text FROM v_current_zone_fees WHERE delivery_zone_id = ${id}::uuid`;
      await tx.$executeRaw`INSERT INTO delivery_zone_fees (delivery_zone_id, amount, created_by_user_id) VALUES (${id}::uuid, ${fee}::numeric, ${actorUserId}::uuid)`;
      await writeAudit(tx, { actorUserId, action: BUSINESS_AUDIT_ACTIONS.FEE_CHANGED, entityTable: 'delivery_zones', entityId: id, changes: { fee: { from: before?.amount ?? null, to: fee } } });
    });
  }

  async deactivate(id: string, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE id = ${id}::uuid AND deactivated_at IS NULL`;
      await writeAudit(tx, { actorUserId, action: BUSINESS_AUDIT_ACTIONS.ZONE_CHANGED, entityTable: 'delivery_zones', entityId: id, changes: { deactivated: true } });
    });
  }

  async reorder(municipalityId: number, ids: string[]): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, index) => this.prisma.$executeRaw`UPDATE delivery_zones SET sort_order = ${index + 1} WHERE id = ${id}::uuid AND municipality_id = ${municipalityId}`),
    );
  }

  async feeHistory(id: string): Promise<FeeChange[]> {
    const rows = await this.prisma.$queryRaw<{ amount: string; created_at: Date; by: string | null }[]>`
      SELECT f.amount::text AS amount, f.created_at, nullif(trim(concat_ws(' ', p.given_names, p.family_names)), '') AS by
      FROM delivery_zone_fees f
      LEFT JOIN users u ON u.id = f.created_by_user_id
      LEFT JOIN people p ON p.id = u.person_id
      WHERE f.delivery_zone_id = ${id}::uuid ORDER BY f.created_at DESC LIMIT 20`;
    return rows.map((r) => ({ fee: r.amount, createdAt: r.created_at, createdBy: r.by }));
  }

  async quote(municipalityId: number, point: GeoPoint): Promise<DeliveryQuote | null> {
    // Si el punto cae justo en el borde de dos zonas vecinas, gana la de menor orden (la primera de la lista).
    const [row] = await this.prisma.$queryRaw<{ fee_id: string; amount: string; zone_id: string; name: string; kind: ZoneKindCode }[]>`
      SELECT f.id AS fee_id, f.amount::text AS amount, z.id AS zone_id, z.name, k.code AS kind
      FROM delivery_zones z
      JOIN zone_kinds k ON k.id = z.zone_kind_id
      JOIN v_current_zone_fees f ON f.delivery_zone_id = z.id
      WHERE z.deactivated_at IS NULL AND z.municipality_id = ${municipalityId} AND ST_Covers(z.area, ${pointSql(point)})
      ORDER BY z.sort_order, z.created_at LIMIT 1`;
    return row ? { deliveryZoneFeeId: row.fee_id, fee: row.amount, zone: { id: row.zone_id, name: row.name, kind: row.kind } } : null;
  }

  async establishmentMunicipality(establishmentId: string): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<{ municipality_id: number }[]>`
      SELECT e.municipality_id FROM establishments e
      JOIN establishment_statuses s ON s.id = e.status_id AND s.is_visible_on_map
      WHERE e.id = ${establishmentId}::uuid`;
    return row?.municipality_id ?? null;
  }

  private async insertZone(tx: Tx, municipalityId: number, data: ZoneData, actorUserId: string, sortOrder?: number): Promise<string> {
    // Recortada: la diferencia se calcula aquí con toda la precisión de PostGIS, no con el anillo redondeado
    // que vio el panel; así el borde queda exactamente pegado al de la zona vecina.
    const area = data.trimOverlaps
      ? Prisma.sql`(WITH ${trimmedPieces(municipalityId, data.area)} SELECT g::geography FROM pieces LIMIT 1)`
      : polygonSql(data.area);
    const [{ id }] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO delivery_zones (municipality_id, zone_kind_id, name, area, sort_order, created_by_user_id)
      SELECT ${municipalityId}, k.id, ${data.name}, ${area}, coalesce(${sortOrder ?? null}::smallint,
             (SELECT coalesce(max(sort_order), 0) + 1 FROM delivery_zones WHERE municipality_id = ${municipalityId} AND deactivated_at IS NULL)),
             ${actorUserId}::uuid
      FROM zone_kinds k WHERE k.code = ${data.kind}
      RETURNING id`;
    await tx.$executeRaw`INSERT INTO delivery_zone_fees (delivery_zone_id, amount, created_by_user_id) VALUES (${id}::uuid, ${data.fee}::numeric, ${actorUserId}::uuid)`;
    return id;
  }
}
