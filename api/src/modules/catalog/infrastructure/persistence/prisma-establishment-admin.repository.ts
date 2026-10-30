import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { ConflictError } from '../../../../shared/domain/domain.error';
import { writeAudit } from '../../../../shared/infrastructure/prisma/audit';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { CATALOG_AUDIT_ACTIONS, ESTABLISHMENT_STATUSES, EstablishmentStatusCode } from '../../domain/catalog.codes';
import {
  EstablishmentAdminRepository,
  EstablishmentData,
  EstablishmentDetail,
  EstablishmentSummary,
} from '../../domain/ports/establishment-admin.repository';
import { GeoPoint } from '../../domain/value-objects/geo-point';
import { likePattern, pointSql, polygonSql } from './sql';

type Tx = Prisma.TransactionClient;

interface SummaryRow {
  id: string;
  name: string;
  address_line: string;
  municipality_id: number;
  municipality_name: string;
  status: EstablishmentStatusCode;
  primary_category: string | null;
  logo_file_id: string | null;
  lat: number;
  lng: number;
  product_count: number;
  available_count: number;
  updated_at: Date;
  created_at: Date;
}

const SUMMARY_SELECT = Prisma.sql`
  SELECT e.id, e.name, e.address_line, e.municipality_id, m.name AS municipality_name, s.code AS status,
         c.code AS primary_category, e.logo_file_id,
         ST_Y(e.location::geometry) AS lat, ST_X(e.location::geometry) AS lng, e.updated_at, e.created_at,
         (SELECT count(*) FROM products p JOIN product_statuses ps ON ps.id = p.status_id AND ps.is_visible
          WHERE p.establishment_id = e.id)::int AS product_count,
         (SELECT count(*) FROM products p JOIN product_statuses ps ON ps.id = p.status_id AND ps.is_orderable
          JOIN menu_sections ms ON ms.id = p.menu_section_id AND ms.deactivated_at IS NULL
          WHERE p.establishment_id = e.id)::int AS available_count
  FROM establishments e
  JOIN municipalities m ON m.id = e.municipality_id
  JOIN establishment_statuses s ON s.id = e.status_id
  LEFT JOIN establishment_category_links l ON l.establishment_id = e.id AND l.is_primary
  LEFT JOIN establishment_categories c ON c.id = l.category_id`;

const toSummary = (r: SummaryRow): EstablishmentSummary => ({
  id: r.id,
  name: r.name,
  addressLine: r.address_line,
  municipality: { id: r.municipality_id, name: r.municipality_name },
  status: r.status,
  primaryCategory: r.primary_category,
  logoFileId: r.logo_file_id,
  location: { lat: r.lat, lng: r.lng },
  productCount: r.product_count,
  availableCount: r.available_count,
  updatedAt: r.updated_at,
});

@Injectable()
export class PrismaEstablishmentAdminRepository extends EstablishmentAdminRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(filter: { municipalityId: number | null; status?: EstablishmentStatusCode; search?: string }): Promise<EstablishmentSummary[]> {
    const conditions = [
      filter.municipalityId !== null ? Prisma.sql`e.municipality_id = ${filter.municipalityId}` : null,
      filter.status ? Prisma.sql`s.code = ${filter.status}` : null,
      filter.search ? Prisma.sql`(e.name ILIKE ${likePattern(filter.search)} OR e.address_line ILIKE ${likePattern(filter.search)})` : null,
    ].filter((c): c is Prisma.Sql => c !== null);
    const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<SummaryRow[]>`${SUMMARY_SELECT} ${where} ORDER BY s.sort_order, e.name LIMIT 500`;
    return rows.map(toSummary);
  }

  async findById(id: string): Promise<EstablishmentDetail | null> {
    const [row] = await this.prisma.$queryRaw<(SummaryRow & { ring: [number, number][]; area_m2: number })[]>`
      SELECT q.*, ST_AsGeoJSON(e.area::geometry)::json -> 'coordinates' -> 0 AS ring, ST_Area(e.area) AS area_m2
      FROM (${SUMMARY_SELECT} WHERE e.id = ${id}::uuid) q
      JOIN establishments e ON e.id = q.id`;
    if (!row) return null;
    const [categories, phones, transitions] = await Promise.all([
      this.prisma.$queryRaw<{ code: string }[]>`
        SELECT c.code FROM establishment_category_links l JOIN establishment_categories c ON c.id = l.category_id
        WHERE l.establishment_id = ${id}::uuid ORDER BY l.is_primary DESC, c.sort_order`,
      this.prisma.establishmentPhone.findMany({ where: { establishmentId: id }, orderBy: { phoneE164: 'asc' } }),
      this.prisma.$queryRaw<{ code: EstablishmentStatusCode }[]>`
        SELECT t.code FROM establishment_status_transitions x
        JOIN establishment_statuses f ON f.id = x.from_status_id
        JOIN establishment_statuses t ON t.id = x.to_status_id AND t.deactivated_at IS NULL
        WHERE f.code = ${row.status} ORDER BY t.sort_order`,
    ]);
    return {
      ...toSummary(row),
      // El anillo de PostGIS viene cerrado (último = primero); el formulario trabaja con vértices únicos.
      area: row.ring.slice(0, -1),
      areaSquareMeters: Math.round(row.area_m2),
      categories: categories.map((c) => c.code),
      phones: phones.map((p) => ({ phone: p.phoneE164, label: p.label })),
      allowedTransitions: transitions.map((t) => t.code),
      createdAt: row.created_at,
    };
  }

  async scopeOf(id: string) {
    const [row] = await this.prisma.$queryRaw<{ municipality_id: number; status: EstablishmentStatusCode }[]>`
      SELECT e.municipality_id, s.code AS status FROM establishments e JOIN establishment_statuses s ON s.id = e.status_id
      WHERE e.id = ${id}::uuid`;
    return row ? { municipalityId: row.municipality_id, status: row.status } : null;
  }

  async servedBy(id: string, userId: string): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ served: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM v_merchant_establishments WHERE establishment_id = ${id}::uuid AND user_id = ${userId}::uuid) AS served`;
    return row.served;
  }

  async create(data: EstablishmentData, actorUserId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const [{ id }] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO establishments (municipality_id, name, address_line, location, area, logo_file_id, status_id, created_by_user_id)
        SELECT ${data.municipalityId}, ${data.name}, ${data.addressLine}, ${pointSql(data.location)}, ${polygonSql(data.area)},
               ${data.logoFileId}::uuid, s.id, ${actorUserId}::uuid
        FROM establishment_statuses s WHERE s.code = ${ESTABLISHMENT_STATUSES.DRAFT}
        RETURNING id`;
      await this.writeRelations(tx, id, data);
      await writeAudit(tx, {
        actorUserId,
        action: CATALOG_AUDIT_ACTIONS.ESTABLISHMENT_CHANGED,
        entityTable: 'establishments',
        entityId: id,
        changes: { created: { name: data.name, categories: data.categories } },
      });
      return id;
    });
  }

  async update(id: string, data: EstablishmentData, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [before] = await tx.$queryRaw<{ name: string; address_line: string; logo_file_id: string | null; moved: boolean }[]>`
        SELECT name, address_line, logo_file_id,
               NOT (ST_Equals(location::geometry, ${pointSql(data.location)}::geometry) AND ST_Equals(area::geometry, ${polygonSql(data.area)}::geometry)) AS moved
        FROM establishments WHERE id = ${id}::uuid FOR UPDATE`;
      await tx.$executeRaw`
        UPDATE establishments
        SET name = ${data.name}, address_line = ${data.addressLine}, location = ${pointSql(data.location)},
            area = ${polygonSql(data.area)}, logo_file_id = ${data.logoFileId}::uuid, updated_at = now()
        WHERE id = ${id}::uuid`;
      const previousCategories = (
        await tx.$queryRaw<{ code: string }[]>`
          SELECT c.code FROM establishment_category_links l JOIN establishment_categories c ON c.id = l.category_id
          WHERE l.establishment_id = ${id}::uuid ORDER BY l.is_primary DESC, c.sort_order`
      ).map((c) => c.code);
      await tx.establishmentCategoryLink.deleteMany({ where: { establishmentId: id } });
      await tx.establishmentPhone.deleteMany({ where: { establishmentId: id } });
      await this.writeRelations(tx, id, data);

      const changes: Record<string, unknown> = {};
      if (before.name !== data.name) changes.name = { from: before.name, to: data.name };
      if (before.address_line !== data.addressLine) changes.addressLine = { from: before.address_line, to: data.addressLine };
      if (before.logo_file_id !== data.logoFileId) changes.logo = { from: before.logo_file_id, to: data.logoFileId };
      if (before.moved) changes.locationOrArea = true;
      if (previousCategories.join() !== data.categories.join()) changes.categories = { from: previousCategories, to: data.categories };
      await writeAudit(tx, {
        actorUserId,
        action: CATALOG_AUDIT_ACTIONS.ESTABLISHMENT_CHANGED,
        entityTable: 'establishments',
        entityId: id,
        changes: changes as Prisma.InputJsonValue,
      });
    });
  }

  private async writeRelations(tx: Tx, id: string, data: EstablishmentData): Promise<void> {
    for (const [index, code] of data.categories.entries()) {
      await tx.$executeRaw`
        INSERT INTO establishment_category_links (establishment_id, category_id, is_primary)
        SELECT ${id}::uuid, c.id, ${index === 0} FROM establishment_categories c WHERE c.code = ${code}`;
    }
    if (data.phones.length) {
      await tx.establishmentPhone.createMany({ data: data.phones.map((p) => ({ establishmentId: id, phoneE164: p.phone, label: p.label })) });
    }
  }

  async isTransitionAllowed(from: EstablishmentStatusCode, to: EstablishmentStatusCode): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM establishment_status_transitions x
        JOIN establishment_statuses f ON f.id = x.from_status_id AND f.code = ${from}
        JOIN establishment_statuses t ON t.id = x.to_status_id AND t.code = ${to} AND t.deactivated_at IS NULL
      ) AS ok`;
    return row.ok;
  }

  async changeStatus(input: { id: string; from: EstablishmentStatusCode; to: EstablishmentStatusCode; actorUserId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Condición sobre el estado actual: si otro cambio llegó primero, no se pisa (concurrencia).
      const updated = await tx.$executeRaw`
        UPDATE establishments e SET status_id = t.id, updated_at = now()
        FROM establishment_statuses f, establishment_statuses t
        WHERE e.id = ${input.id}::uuid AND f.code = ${input.from} AND t.code = ${input.to} AND e.status_id = f.id`;
      if (updated !== 1) throw new ConflictError('STATUS_CONFLICT', 'El estado cambió mientras tanto');
      await writeAudit(tx, {
        actorUserId: input.actorUserId,
        action: CATALOG_AUDIT_ACTIONS.ESTABLISHMENT_CHANGED,
        entityTable: 'establishments',
        entityId: input.id,
        changes: { status: { from: input.from, to: input.to } },
      });
    });
  }

  async countOrderableProducts(id: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM v_menu WHERE establishment_id = ${id}::uuid AND is_orderable`;
    return row.count;
  }

  async nameTaken(municipalityId: number, name: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ taken: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM establishments WHERE municipality_id = ${municipalityId} AND lower(name) = lower(${name})
          ${exceptId ? Prisma.sql`AND id <> ${exceptId}::uuid` : Prisma.empty}
      ) AS taken`;
    return row.taken;
  }

  async activeCategoryCodes(codes: string[]): Promise<string[]> {
    const rows = await this.prisma.establishmentCategory.findMany({ where: { code: { in: codes }, deactivatedAt: null }, select: { code: true } });
    return rows.map((r) => r.code);
  }

  async municipality(id: number, point?: GeoPoint) {
    const covers = point ? Prisma.sql`(m.boundary IS NULL OR ST_Covers(m.boundary, ${pointSql(point)}))` : Prisma.sql`true`;
    const [row] = await this.prisma.$queryRaw<{ id: number; covers: boolean }[]>`SELECT m.id, ${covers} AS covers FROM municipalities m WHERE m.id = ${id}`;
    return row ?? null;
  }

  async municipalities(scope: number | null) {
    const rows = await this.prisma.$queryRaw<{ id: number; name: string; lat: number; lng: number; launched: boolean }[]>`
      SELECT m.id, m.name, ST_Y(m.center::geometry) AS lat, ST_X(m.center::geometry) AS lng,
             (m.launched_at IS NOT NULL AND m.launched_at <= now()) AS launched
      FROM municipalities m ${scope !== null ? Prisma.sql`WHERE m.id = ${scope}` : Prisma.empty}
      ORDER BY m.name`;
    return rows.map((r) => ({ id: r.id, name: r.name, center: { lat: r.lat, lng: r.lng }, launched: r.launched }));
  }

  async fileIsUsableAs(fileId: string, purpose: string): Promise<boolean> {
    return (await this.prisma.file.count({ where: { id: fileId, purpose: { code: purpose } } })) > 0;
  }
}
