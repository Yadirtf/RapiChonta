import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { CatalogIds } from '../../../../shared/infrastructure/prisma/catalog-ids';
import { writeAudit } from '../../../../shared/infrastructure/prisma/audit';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { COURIER_VERIFICATION, CourierVerificationCode, ROLES, UserStatusCode } from '../../domain/identity.codes';
import { CourierDetail, CourierRepository, CourierSummary, MunicipalityChange, NewCourier } from '../../domain/ports/courier.repository';
import { AccountWriter } from './account-writer';

interface CourierRow {
  user_id: string;
  given_names: string;
  family_names: string | null;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  verification_status: string;
  account_status: string;
  municipality_id: number | null;
  municipality_name: string | null;
  funding_mode: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  vehicle_description: string | null;
  created_at: Date;
}

/** Fecha de negocio de hoy en Colombia (los modos de financiación rigen por día). */
const businessDate = () => new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }));

@Injectable()
export class PrismaCourierRepository extends CourierRepository {
  private readonly writer: AccountWriter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
    this.writer = new AccountWriter(ids);
  }

  async create(courier: NewCourier): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      let userId = courier.existingUserId;
      if (userId) {
        await this.writer.promoteExistingAccount(tx, userId, courier);
      } else {
        ({ userId } = await this.writer.createAccount(tx, {
          ...courier,
          phoneVerified: false,
          language: 'es',
          createdByUserId: courier.createdByUserId,
        }));
        await writeAudit(tx, { actorUserId: courier.createdByUserId, action: 'USER_CREATED', entityTable: 'users', entityId: userId });
      }

      await this.writer.grantRole(tx, {
        userId,
        role: ROLES.COURIER,
        municipalityId: courier.municipalityId,
        grantedByUserId: courier.createdByUserId,
      });
      // Modo cliente (RF-06): el domiciliario también puede pedir.
      await this.writer.grantRole(tx, { userId, role: ROLES.CUSTOMER, municipalityId: null, grantedByUserId: courier.createdByUserId });
      await writeAudit(tx, {
        actorUserId: courier.createdByUserId,
        action: 'ROLE_GRANTED',
        entityTable: 'users',
        entityId: userId,
        changes: { role: ROLES.COURIER, municipalityId: courier.municipalityId },
      });

      const pending = await this.ids.of('courier_verification_statuses', COURIER_VERIFICATION.PENDING, tx);
      await tx.courierProfile.create({
        data: { userId, verificationStatusId: pending, createdByUserId: courier.createdByUserId },
      });
      await tx.courierVerificationHistory.create({
        data: { courierUserId: userId, toStatusId: pending, changedByUserId: courier.createdByUserId },
      });
      await tx.courierFundingMode.create({
        data: {
          courierUserId: userId,
          fundingModeId: await this.ids.of('funding_modes', courier.fundingMode, tx),
          effectiveOn: businessDate(),
          createdByUserId: courier.createdByUserId,
        },
      });
      await tx.vehicle.create({
        data: {
          courierUserId: userId,
          vehicleTypeId: await this.ids.of('vehicle_types', courier.vehicle.type, tx),
          plate: courier.vehicle.plate ?? null,
          description: courier.vehicle.description ?? null,
        },
      });
      for (const account of courier.collectionAccounts) {
        await tx.courierCollectionAccount.create({
          data: {
            courierUserId: userId,
            paymentMethodId: await this.ids.of('payment_methods', account.paymentMethod, tx),
            bankId: account.bank ? await this.ids.of('banks', account.bank, tx) : null,
            bankAccountTypeId: account.bankAccountType ? await this.ids.of('bank_account_types', account.bankAccountType, tx) : null,
            accountNumber: account.accountNumber,
            holderName: account.holderName,
          },
        });
      }
      return userId;
    });
  }

  async list(filter: { verificationStatus?: CourierVerificationCode; search?: string }): Promise<CourierSummary[]> {
    const search = filter.search?.replace(/[%_\\]/g, '');
    const digits = search?.replace(/\D/g, '') ?? '';
    const rows = await this.query(Prisma.sql`
      ${filter.verificationStatus ? Prisma.sql`AND vs.code = ${filter.verificationStatus}` : Prisma.empty}
      ${search ? Prisma.sql`AND (
              unaccent(p.given_names || ' ' || coalesce(p.family_names, '')) ILIKE '%' || unaccent(${search}) || '%'
              OR (${digits} <> '' AND pp.phone_e164 LIKE '%' || ${digits} || '%')
              OR p.document_number = upper(${search}))` : Prisma.empty}`);
    return rows.map(toSummary);
  }

  async findById(userId: string): Promise<CourierDetail | null> {
    const [row] = await this.query(Prisma.sql`AND cp.user_id = ${userId}::uuid`);
    if (!row) return null;
    const [accounts, history] = await Promise.all([
      this.prisma.courierCollectionAccount.findMany({
        where: { courierUserId: userId, archivedAt: null },
        include: { paymentMethod: true, bank: true, bankAccountType: true },
        orderBy: { paymentMethod: { sortOrder: 'asc' } },
      }),
      this.prisma.courierVerificationHistory.findMany({
        where: { courierUserId: userId },
        include: {
          toStatus: true,
          transition: { include: { fromStatus: true } },
          changedBy: { include: { person: { select: { givenNames: true, familyNames: true } } } },
        },
        orderBy: { changedAt: 'desc' },
      }),
    ]);
    return {
      ...toSummary(row),
      vehicleDescription: row.vehicle_description,
      collectionAccounts: accounts.map((a) => ({
        id: a.id,
        paymentMethod: a.paymentMethod.code,
        bank: a.bank?.name ?? null,
        bankAccountType: a.bankAccountType?.code ?? null,
        accountNumber: a.accountNumber,
        holderName: a.holderName,
      })),
      verificationHistory: history.map((h) => ({
        from: h.transition?.fromStatus.code ?? null,
        to: h.toStatus.code,
        reason: h.reason,
        changedAt: h.changedAt,
        changedBy: h.changedBy ? [h.changedBy.person.givenNames, h.changedBy.person.familyNames].filter(Boolean).join(' ') : null,
      })),
    };
  }

  async currentVerification(userId: string): Promise<CourierVerificationCode | null> {
    const profile = await this.prisma.courierProfile.findUnique({ where: { userId }, include: { verificationStatus: true } });
    return (profile?.verificationStatus.code as CourierVerificationCode) ?? null;
  }

  async changeMunicipality(input: { userId: string; municipalityId: number; changedByUserId: string }): Promise<MunicipalityChange> {
    return this.prisma.$transaction(async (tx) => {
      // El bloqueo del usuario es el mismo que toma el disparador de user_roles: dos cambios a la vez no se cruzan.
      await tx.$executeRaw`SELECT 1 FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;
      const roleId = await this.ids.of('roles', ROLES.COURIER, tx);
      const current = await tx.userRole.findFirst({ where: { userId: input.userId, roleId, revokedAt: null } });
      if (!current) return 'NOT_FOUND';
      if (current.municipalityId === input.municipalityId) return 'SAME';
      const [{ busy }] = await tx.$queryRaw<{ busy: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM order_assignments WHERE courier_user_id = ${input.userId}::uuid AND released_at IS NULL) AS busy`;
      if (busy) return 'HAS_ACTIVE_ORDER';

      await tx.userRole.update({ where: { id: current.id }, data: { revokedAt: new Date(), revokedByUserId: input.changedByUserId } });
      await this.writer.grantRole(tx, { userId: input.userId, role: ROLES.COURIER, municipalityId: input.municipalityId, grantedByUserId: input.changedByUserId });
      const changes = { role: ROLES.COURIER, fromMunicipalityId: current.municipalityId, municipalityId: input.municipalityId };
      await writeAudit(tx, { actorUserId: input.changedByUserId, action: 'ROLE_REVOKED', entityTable: 'users', entityId: input.userId, changes });
      await writeAudit(tx, { actorUserId: input.changedByUserId, action: 'ROLE_GRANTED', entityTable: 'users', entityId: input.userId, changes });
      return 'CHANGED';
    });
  }

  async isTransitionAllowed(from: CourierVerificationCode, to: CourierVerificationCode): Promise<boolean> {
    const count = await this.prisma.courierVerificationTransition.count({
      where: { fromStatus: { code: from }, toStatus: { code: to } },
    });
    return count > 0;
  }

  async changeVerification(input: {
    userId: string;
    from: CourierVerificationCode;
    to: CourierVerificationCode;
    changedByUserId: string;
    reason?: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // El disparador aplica el cambio solo si el estado actual sigue siendo `from` (concurrencia).
      await tx.courierVerificationHistory.create({
        data: {
          courierUserId: input.userId,
          fromStatusId: await this.ids.of('courier_verification_statuses', input.from, tx),
          toStatusId: await this.ids.of('courier_verification_statuses', input.to, tx),
          changedByUserId: input.changedByUserId,
          reason: input.reason ?? null,
        },
      });
      if (input.to === COURIER_VERIFICATION.VERIFIED) {
        await writeAudit(tx, { actorUserId: input.changedByUserId, action: 'COURIER_VERIFIED', entityTable: 'courier_profiles', entityId: input.userId });
      }
    });
  }

  private query(where: Prisma.Sql): Promise<CourierRow[]> {
    return this.prisma.$queryRaw<CourierRow[]>`
      SELECT cp.user_id, p.given_names, p.family_names, pp.phone_e164 AS phone,
             dt.code AS document_type, p.document_number,
             vs.code AS verification_status, us.code AS account_status,
             m.id AS municipality_id, m.name AS municipality_name,
             fm.funding_mode_code AS funding_mode,
             vt.code AS vehicle_type, v.plate AS vehicle_plate, v.description AS vehicle_description,
             cp.created_at
      FROM courier_profiles cp
      JOIN users u ON u.id = cp.user_id
      JOIN user_statuses us ON us.id = u.status_id
      JOIN people p ON p.id = u.person_id
      JOIN courier_verification_statuses vs ON vs.id = cp.verification_status_id
      LEFT JOIN document_types dt ON dt.id = p.document_type_id
      LEFT JOIN person_phones pp ON pp.person_id = p.id AND pp.is_primary
      LEFT JOIN v_active_user_roles ar ON ar.user_id = cp.user_id AND ar.role_code = 'COURIER'
      LEFT JOIN municipalities m ON m.id = ar.municipality_id
      LEFT JOIN v_current_courier_funding_mode fm ON fm.courier_user_id = cp.user_id
      LEFT JOIN vehicles v ON v.courier_user_id = cp.user_id AND v.retired_at IS NULL
      LEFT JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
      WHERE true ${where}
      ORDER BY vs.sort_order, cp.created_at DESC
      LIMIT 500`;
  }
}

function toSummary(row: CourierRow): CourierSummary {
  return {
    userId: row.user_id,
    givenNames: row.given_names,
    familyNames: row.family_names,
    phone: row.phone,
    documentType: row.document_type,
    documentNumber: row.document_number,
    verificationStatus: row.verification_status as CourierVerificationCode,
    accountStatus: row.account_status as UserStatusCode,
    municipality: row.municipality_id ? { id: row.municipality_id, name: row.municipality_name ?? '' } : null,
    fundingMode: row.funding_mode,
    vehicle: row.vehicle_type ? { type: row.vehicle_type, plate: row.vehicle_plate } : null,
    createdAt: row.created_at,
  };
}
