import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { writeAudit } from '../../../shared/infrastructure/prisma/audit';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { BUSINESS_AUDIT_ACTIONS, SettingDataTypeCode } from '../domain/business-config.codes';
import { CommissionVersion, SettingChange, SettingRecord, SettingsRepository, SettingVersion } from '../domain/ports/settings.repository';
import { trimDecimal } from '../domain/value-objects/business-values';

interface SettingRow {
  key: string;
  type: SettingDataTypeCode;
  min: string | null;
  max: string | null;
  scoped: boolean;
  default_value: string | null;
  global_value: string | null;
  global_at: Date | null;
  global_by: string | null;
  global_seed: boolean | null;
  local_value: string | null;
  local_at: Date | null;
  local_by: string | null;
}

/** Nombre de quien hizo el cambio (people), o null si lo puso la semilla. */
const AUTHOR = (alias: string) =>
  Prisma.sql`(SELECT nullif(trim(concat_ws(' ', p.given_names, p.family_names)), '') FROM users u JOIN people p ON p.id = u.person_id WHERE u.id = ${Prisma.raw(alias)}.created_by_user_id)`;

const version = (value: string | null, at: Date | null, by: string | null): SettingVersion | null =>
  value === null || at === null ? null : { value: trimDecimal(value), createdAt: at, createdBy: by };

@Injectable()
export class PrismaSettingsRepository extends SettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  list(municipalityId: number | null): Promise<SettingRecord[]> {
    return this.query(municipalityId);
  }

  async find(key: string, municipalityId: number | null): Promise<SettingRecord | null> {
    return (await this.query(municipalityId, key))[0] ?? null;
  }

  async insert(input: { key: string; municipalityId: number | null; value: string; previous: string | null; actorUserId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO setting_values (setting_definition_id, municipality_id, value, created_by_user_id)
        SELECT d.id, ${input.municipalityId}::integer, ${input.value}::numeric, ${input.actorUserId}::uuid FROM setting_definitions d WHERE d.key = ${input.key}
        RETURNING id`;
      await writeAudit(tx, {
        actorUserId: input.actorUserId,
        action: BUSINESS_AUDIT_ACTIONS.SETTING_CHANGED,
        entityTable: 'setting_values',
        entityId: row.id,
        changes: { key: input.key, municipalityId: input.municipalityId, from: input.previous, to: input.value },
      });
    });
  }

  async history(key: string, municipalityId: number | null, limit: number): Promise<SettingChange[]> {
    const rows = await this.prisma.$queryRaw<{ value: string; municipality_id: number | null; created_at: Date; by: string | null }[]>`
      SELECT v.value::text, v.municipality_id, v.created_at, ${AUTHOR('v')} AS by
      FROM setting_values v JOIN setting_definitions d ON d.id = v.setting_definition_id
      WHERE d.key = ${key} AND (v.municipality_id IS NULL OR v.municipality_id = ${municipalityId}::integer)
      ORDER BY v.created_at DESC LIMIT ${limit}`;
    return rows.map((r) => ({ value: trimDecimal(r.value), municipalityId: r.municipality_id, createdAt: r.created_at, createdBy: r.by }));
  }

  async commissionHistory(municipalityId: number, limit: number): Promise<CommissionVersion[]> {
    const rows = await this.prisma.$queryRaw<{ rate: string; created_at: Date; by: string | null }[]>`
      SELECT c.rate::text, c.created_at, ${AUTHOR('c')} AS by FROM commission_rates c
      WHERE c.municipality_id = ${municipalityId} ORDER BY c.created_at DESC LIMIT ${limit}`;
    return rows.map((r) => ({ rate: r.rate, createdAt: r.created_at, createdBy: r.by }));
  }

  async insertCommission(input: { municipalityId: number; rate: string; previous: string | null; actorUserId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO commission_rates (municipality_id, rate, created_by_user_id)
        VALUES (${input.municipalityId}, ${input.rate}::numeric, ${input.actorUserId}::uuid) RETURNING id`;
      await writeAudit(tx, {
        actorUserId: input.actorUserId,
        action: BUSINESS_AUDIT_ACTIONS.COMMISSION_CHANGED,
        entityTable: 'commission_rates',
        entityId: row.id,
        changes: { municipalityId: input.municipalityId, from: input.previous, to: input.rate },
      });
    });
  }

  private async query(municipalityId: number | null, key?: string): Promise<SettingRecord[]> {
    const rows = await this.prisma.$queryRaw<SettingRow[]>`
      SELECT d.key, t.code AS type, d.min_value::text AS min, d.max_value::text AS max, d.is_scoped_by_municipality AS scoped,
             (SELECT v.value::text FROM setting_values v WHERE v.setting_definition_id = d.id AND v.municipality_id IS NULL
              ORDER BY v.created_at LIMIT 1) AS default_value,
             g.value::text AS global_value, g.created_at AS global_at, g.by AS global_by,
             l.value::text AS local_value, l.created_at AS local_at, l.by AS local_by
      FROM setting_definitions d
      JOIN setting_data_types t ON t.id = d.data_type_id
      LEFT JOIN LATERAL (
        SELECT v.value, v.created_at, ${AUTHOR('v')} AS by FROM setting_values v
        WHERE v.setting_definition_id = d.id AND v.municipality_id IS NULL ORDER BY v.created_at DESC LIMIT 1
      ) g ON true
      LEFT JOIN LATERAL (
        SELECT v.value, v.created_at, ${AUTHOR('v')} AS by FROM setting_values v
        WHERE v.setting_definition_id = d.id AND v.municipality_id = ${municipalityId}::integer ORDER BY v.created_at DESC LIMIT 1
      ) l ON true
      ${key ? Prisma.sql`WHERE d.key = ${key}` : Prisma.empty}
      ORDER BY d.key`;
    return rows.map((r) => ({
      key: r.key,
      type: r.type,
      min: r.min === null ? null : trimDecimal(r.min),
      max: r.max === null ? null : trimDecimal(r.max),
      scoped: r.scoped,
      defaultValue: r.default_value === null ? null : trimDecimal(r.default_value),
      global: version(r.global_value, r.global_at, r.global_by),
      municipal: r.scoped ? version(r.local_value, r.local_at, r.local_by) : null,
    }));
  }
}
