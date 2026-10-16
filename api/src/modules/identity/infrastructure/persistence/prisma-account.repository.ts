import { Injectable } from '@nestjs/common';
import { CatalogIds } from '../../../../shared/infrastructure/prisma/catalog-ids';
import { writeAudit } from '../../../../shared/infrastructure/prisma/audit';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { ROLES, RoleCode, SESSION_END_REASONS, USER_STATUSES, UserStatusCode } from '../../domain/identity.codes';
import { IdentityErrors } from '../../domain/identity.errors';
import { Account, AccountRepository, NewCustomer } from '../../domain/ports/account.repository';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { ACCOUNT_INCLUDE, toAccount } from './account.mapper';
import { AccountWriter } from './account-writer';

@Injectable()
export class PrismaAccountRepository extends AccountRepository {
  private readonly writer: AccountWriter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
    this.writer = new AccountWriter(ids);
  }

  async findByPhone(phone: PhoneNumber): Promise<Account | null> {
    const row = await this.prisma.personPhone.findUnique({
      where: { phoneE164: phone.e164 },
      select: { person: { select: { user: { include: ACCOUNT_INCLUDE } } } },
    });
    return row?.person.user ? toAccount(row.person.user) : null;
  }

  async findById(userId: string): Promise<Account | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: ACCOUNT_INCLUDE });
    return user ? toAccount(user) : null;
  }

  async registerCustomer(customer: NewCustomer): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const { userId, personId } = await this.writer.createAccount(tx, {
        givenNames: customer.givenNames,
        familyNames: customer.familyNames,
        phone: customer.phone,
        phoneVerified: true,
        language: customer.language,
        createdByUserId: null,
      });
      await this.writer.grantRole(tx, { userId, role: ROLES.CUSTOMER, municipalityId: null, grantedByUserId: null });
      await tx.personConsent.createMany({
        data: customer.acceptedLegalVersionIds.map((versionId) => ({
          personId,
          legalDocumentVersionId: versionId,
          ipAddress: customer.ipAddress ?? null,
        })),
      });
      return userId;
    });
  }

  async grantSelfAssignableRole(userId: string, role: RoleCode): Promise<void> {
    const definition = await this.prisma.role.findUnique({ where: { code: role } });
    if (!definition?.isSelfAssignable) throw IdentityErrors.roleNotGranted();
    await this.prisma.$transaction((tx) => this.writer.grantRole(tx, { userId, role, municipalityId: null, grantedByUserId: null }));
  }

  async markPhoneVerified(phone: PhoneNumber): Promise<void> {
    await this.prisma.personPhone.updateMany({ where: { phoneE164: phone.e164, verifiedAt: null }, data: { verifiedAt: new Date() } });
  }

  async updateNames(userId: string, givenNames: string, familyNames: string | null): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
    await this.prisma.person.update({ where: { id: user.personId }, data: { givenNames, familyNames } });
  }

  async setLanguage(userId: string, language: string): Promise<void> {
    const languageId = await this.ids.of('languages', language);
    await this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId, languageId },
      update: { languageId },
    });
  }

  async replacePrimaryPhone(userId: string, phone: PhoneNumber): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
      await tx.personPhone.deleteMany({ where: { personId: user.personId, isPrimary: true } });
      await tx.personPhone.create({
        data: { personId: user.personId, phoneE164: phone.e164, isPrimary: true, verifiedAt: new Date() },
      });
    });
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } });
  }

  async changeStatus(input: { userId: string; to: UserStatusCode; changedByUserId: string | null; reason?: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<{ status_id: number }[]>`
        SELECT status_id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;
      if (!current) throw IdentityErrors.userNotFound();
      const target = await tx.userStatus.findUniqueOrThrow({ where: { code: input.to } });
      // La llave foránea compuesta hacia user_status_transitions rechaza un cambio no permitido.
      await tx.userStatusHistory.create({
        data: {
          userId: input.userId,
          fromStatusId: current.status_id,
          toStatusId: target.id,
          changedByUserId: input.changedByUserId,
          reason: input.reason ?? null,
        },
      });
      if (!target.canSignIn) {
        await this.writer.endSessions(tx, { userId: input.userId }, SESSION_END_REASONS.ACCOUNT_DISABLED);
      }
      if (input.to === USER_STATUSES.DEACTIVATED) {
        await writeAudit(tx, {
          actorUserId: input.changedByUserId,
          action: 'USER_DEACTIVATED',
          entityTable: 'users',
          entityId: input.userId,
          changes: input.reason ? { reason: input.reason } : undefined,
        });
      }
    });
  }

  async documentInUse(documentType: string, documentNumber: string, exceptPersonId?: string): Promise<boolean> {
    const count = await this.prisma.person.count({
      where: {
        documentType: { code: documentType },
        documentNumber,
        ...(exceptPersonId ? { id: { not: exceptPersonId } } : {}),
      },
    });
    return count > 0;
  }

  async deletePersonalData(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
      await tx.dataRequest.create({
        data: {
          personId: user.personId,
          requestTypeId: await this.ids.of('data_request_types', 'DELETION', tx),
          statusId: await this.ids.of('data_request_statuses', 'COMPLETED', tx),
          resolvedAt: new Date(),
        },
      });
      await tx.$executeRaw`SELECT anonymize_person(${user.personId}::uuid, ${userId}::uuid)`;
    });
  }
}
