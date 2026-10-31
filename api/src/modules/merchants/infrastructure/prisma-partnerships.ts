import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { writeAudit } from '../../../shared/infrastructure/prisma/audit';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { AGREEMENT_PURPOSE, MERCHANT_AUDIT, MERCHANT_ROLE } from '../domain/merchants.codes';
import { Partnership, PartnershipRefusal, PartnershipView, Partnerships } from '../domain/ports/partnerships';

interface PartnershipRow {
  id: string;
  started_on: string;
  ended_on: string | null;
  agreement_file_id: string | null;
  created_at: Date;
  created_by: string;
}

const toPartnership = (r: PartnershipRow): Partnership => ({
  id: r.id,
  startedOn: r.started_on,
  endedOn: r.ended_on,
  agreementFileId: r.agreement_file_id,
  createdAt: r.created_at,
  createdBy: r.created_by,
});

/** Lo que la base rechaza al escribir un convenio, en el idioma del caso de uso. */
function refusalOf(error: unknown): PartnershipRefusal | null {
  const code = (error as { meta?: { code?: string }; cause?: { code?: string } })?.meta?.code ?? (error as { code?: string })?.code;
  const text = String((error as Error)?.message ?? '');
  if (code === '23P01' || text.includes('establishment_partnerships_no_overlap')) return 'ACTIVE';
  if (text.includes('establishment_partnerships_dates_check')) return 'DATES';
  if (text.includes('PARTNERSHIP_AGREEMENT')) return 'FILE';
  if (text.includes('establishment_staff_active_key')) return 'STAFF_EXISTS';
  return null;
}

/**
 * Convenios con los comercios y quién los atiende (H15.1). Las fechas son del municipio del local: "hoy" sale de su
 * zona horaria, igual que en v_establishment_partners.
 */
@Injectable()
export class PrismaPartnerships extends Partnerships {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async view(establishmentId: string): Promise<PartnershipView | null> {
    const [store] = await this.prisma.$queryRaw<{ id: string; name: string; municipality_id: number; today: string }[]>`
      SELECT e.id, e.name, e.municipality_id, (now() AT TIME ZONE m.time_zone)::date::text AS today
      FROM establishments e JOIN municipalities m ON m.id = e.municipality_id
      WHERE e.id = ${establishmentId}::uuid`;
    if (!store) return null;
    const [partnerships, members] = await Promise.all([
      this.prisma.$queryRaw<PartnershipRow[]>`
        SELECT p.id, p.started_on::text AS started_on, p.ended_on::text AS ended_on, p.agreement_file_id, p.created_at,
               concat_ws(' ', cp.given_names, cp.family_names) AS created_by
        FROM establishment_partnerships p
        JOIN users cu ON cu.id = p.created_by_user_id JOIN people cp ON cp.id = cu.person_id
        WHERE p.establishment_id = ${establishmentId}::uuid
        ORDER BY p.started_on DESC`,
      this.prisma.$queryRaw<
        { staff_id: string; user_id: string; given_names: string; family_names: string | null; phone: string | null; granted_at: Date; last_sign_in_at: Date | null }[]
      >`
        SELECT s.id AS staff_id, s.user_id, p.given_names, p.family_names, ph.phone_e164 AS phone, s.granted_at,
               (SELECT max(se.created_at) FROM sessions se WHERE se.user_id = s.user_id) AS last_sign_in_at
        FROM establishment_staff s
        JOIN users u ON u.id = s.user_id JOIN people p ON p.id = u.person_id
        LEFT JOIN person_phones ph ON ph.person_id = p.id AND ph.is_primary
        WHERE s.establishment_id = ${establishmentId}::uuid AND s.revoked_at IS NULL
        ORDER BY s.granted_at`,
    ]);
    const today = store.today;
    const covers = (p: PartnershipRow) => p.started_on <= today && (p.ended_on === null || p.ended_on > today);
    const current = partnerships.find(covers);
    const upcoming = partnerships.filter((p) => p.started_on > today && p.ended_on !== p.started_on).at(-1);
    return {
      establishment: { id: store.id, name: store.name, municipalityId: store.municipality_id, today },
      current: current ? toPartnership(current) : null,
      upcoming: upcoming ? toPartnership(upcoming) : null,
      past: partnerships.filter((p) => p !== current && p !== upcoming).map(toPartnership),
      members: members.map((m) => ({
        staffId: m.staff_id,
        userId: m.user_id,
        givenNames: m.given_names,
        familyNames: m.family_names,
        phone: m.phone,
        grantedAt: m.granted_at,
        lastSignInAt: m.last_sign_in_at,
      })),
    };
  }

  async start(input: { establishmentId: string; startedOn: string; endedOn: string | null; agreementFileId: string | null; actorUserId: string }) {
    return this.write(async (tx) => {
      if (input.agreementFileId) {
        const [file] = await tx.$queryRaw<{ ok: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM files f JOIN file_purposes p ON p.id = f.purpose_id AND p.code = ${AGREEMENT_PURPOSE}
                         WHERE f.id = ${input.agreementFileId}::uuid) AS ok`;
        if (!file.ok) return 'FILE';
      }
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO establishment_partnerships (establishment_id, started_on, ended_on, agreement_file_id, created_by_user_id)
        VALUES (${input.establishmentId}::uuid, ${input.startedOn}::date, ${input.endedOn}::date, ${input.agreementFileId}::uuid, ${input.actorUserId}::uuid)
        RETURNING id`;
      await writeAudit(tx, {
        actorUserId: input.actorUserId,
        action: MERCHANT_AUDIT.PARTNERSHIP_CHANGED,
        entityTable: 'establishment_partnerships',
        entityId: row.id,
        changes: { started: { establishmentId: input.establishmentId, startedOn: input.startedOn, endedOn: input.endedOn } },
      });
      return null;
    });
  }

  async end(input: { establishmentId: string; endedOn: string; actorUserId: string }) {
    return this.write(async (tx) => {
      // El convenio abierto (sin fecha de fin) que sigue vigente o aún no empieza.
      const [open] = await tx.$queryRaw<{ id: string; started_on: string }[]>`
        SELECT p.id, p.started_on::text AS started_on FROM establishment_partnerships p
        WHERE p.establishment_id = ${input.establishmentId}::uuid AND p.ended_on IS NULL
        FOR UPDATE`;
      if (!open) return 'NONE';
      // Un convenio que aún no empieza se cancela: termina el mismo día que empieza (rango vacío).
      const endedOn = input.endedOn < open.started_on ? open.started_on : input.endedOn;
      await tx.$executeRaw`
        UPDATE establishment_partnerships SET ended_on = ${endedOn}::date, ended_by_user_id = ${input.actorUserId}::uuid
        WHERE id = ${open.id}::uuid`;
      await writeAudit(tx, {
        actorUserId: input.actorUserId,
        action: MERCHANT_AUDIT.PARTNERSHIP_CHANGED,
        entityTable: 'establishment_partnerships',
        entityId: open.id,
        changes: { ended: { endedOn } },
      });
      return null;
    });
  }

  async merchantByPhone(phoneE164: string) {
    const [row] = await this.prisma.$queryRaw<{ user_id: string }[]>`
      SELECT u.id AS user_id FROM person_phones ph
      JOIN users u ON u.person_id = ph.person_id
      JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
      JOIN roles r ON r.id = ur.role_id AND r.code = ${MERCHANT_ROLE}
      WHERE ph.phone_e164 = ${phoneE164} AND ph.is_primary
      LIMIT 1`;
    return row ? { userId: row.user_id } : null;
  }

  async addMember(input: { establishmentId: string; userId: string; actorUserId: string }) {
    return this.write(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO establishment_staff (user_id, establishment_id, granted_by_user_id)
        VALUES (${input.userId}::uuid, ${input.establishmentId}::uuid, ${input.actorUserId}::uuid)
        RETURNING id`;
      await writeAudit(tx, {
        actorUserId: input.actorUserId,
        action: MERCHANT_AUDIT.STORE_STAFF_CHANGED,
        entityTable: 'establishment_staff',
        entityId: row.id,
        changes: { granted: { userId: input.userId, establishmentId: input.establishmentId } },
      });
      return null;
    });
  }

  async revokeMember(input: { establishmentId: string; staffId: string; actorUserId: string }) {
    return this.write(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE establishment_staff SET revoked_at = now(), revoked_by_user_id = ${input.actorUserId}::uuid
        WHERE id = ${input.staffId}::uuid AND establishment_id = ${input.establishmentId}::uuid AND revoked_at IS NULL`;
      if (updated !== 1) return 'STAFF_NOT_FOUND';
      await writeAudit(tx, {
        actorUserId: input.actorUserId,
        action: MERCHANT_AUDIT.STORE_STAFF_CHANGED,
        entityTable: 'establishment_staff',
        entityId: input.staffId,
        changes: { revoked: { establishmentId: input.establishmentId } },
      });
      return null;
    });
  }

  private async write(work: (tx: Prisma.TransactionClient) => Promise<PartnershipRefusal | null>): Promise<PartnershipRefusal | null> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal) return refusal;
      throw error;
    }
  }
}
