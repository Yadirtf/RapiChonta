import { Prisma } from '@prisma/client';
import { CatalogIds } from '../../../../shared/infrastructure/prisma/catalog-ids';
import { RoleCode, SESSION_END_REASONS, SessionEndReasonCode, USER_STATUSES } from '../../domain/identity.codes';
import { PhoneNumber } from '../../domain/value-objects/phone-number';

type Tx = Prisma.TransactionClient;

/**
 * Escrituras que comparten el registro del cliente, la creación de domiciliarios y la de personal.
 * Todas reciben la transacción del caso de uso: o se guarda todo, o nada.
 */
export class AccountWriter {
  constructor(private readonly ids: CatalogIds) {}

  /** people + person_phones + users + primera fila del historial (NULL → ACTIVE) + preferencias. */
  async createAccount(
    tx: Tx,
    input: {
      givenNames: string;
      familyNames: string | null;
      documentType?: string;
      documentNumber?: string;
      phone: PhoneNumber;
      phoneVerified: boolean;
      passwordHash?: string;
      language: string;
      createdByUserId: string | null;
    },
  ): Promise<{ userId: string; personId: string }> {
    const person = await tx.person.create({
      data: {
        givenNames: input.givenNames,
        familyNames: input.familyNames,
        documentTypeId: input.documentType ? await this.ids.of('document_types', input.documentType, tx) : null,
        documentNumber: input.documentNumber ?? null,
      },
    });
    await tx.personPhone.create({
      data: {
        personId: person.id,
        phoneE164: input.phone.e164,
        isPrimary: true,
        verifiedAt: input.phoneVerified ? new Date() : null,
      },
    });
    const active = await this.ids.of('user_statuses', USER_STATUSES.ACTIVE, tx);
    const user = await tx.user.create({
      data: {
        personId: person.id,
        statusId: active,
        passwordHash: input.passwordHash ?? null,
        passwordChangedAt: input.passwordHash ? new Date() : null,
      },
    });
    await tx.userStatusHistory.create({
      data: { userId: user.id, toStatusId: active, changedByUserId: input.createdByUserId },
    });
    await tx.userPreference.create({
      data: { userId: user.id, languageId: await this.ids.of('languages', input.language, tx) },
    });
    return { userId: user.id, personId: person.id };
  }

  /** Un cliente existente pasa a ser personal o domiciliario: el administrador confirma sus datos y su contraseña. */
  async promoteExistingAccount(
    tx: Tx,
    userId: string,
    input: { givenNames: string; familyNames: string; documentType: string; documentNumber: string; passwordHash: string },
  ): Promise<void> {
    const user = await tx.user.update({
      where: { id: userId },
      data: { passwordHash: input.passwordHash, passwordChangedAt: new Date() },
    });
    await tx.person.update({
      where: { id: user.personId },
      data: {
        givenNames: input.givenNames,
        familyNames: input.familyNames,
        documentTypeId: await this.ids.of('document_types', input.documentType, tx),
        documentNumber: input.documentNumber,
      },
    });
  }

  async grantRole(
    tx: Tx,
    input: { userId: string; role: RoleCode; municipalityId: number | null; grantedByUserId: string | null },
  ): Promise<void> {
    const roleId = await this.ids.of('roles', input.role, tx);
    const exists = await tx.userRole.findFirst({
      where: { userId: input.userId, roleId, municipalityId: input.municipalityId, revokedAt: null },
    });
    if (exists) return;
    await tx.userRole.create({
      data: { userId: input.userId, roleId, municipalityId: input.municipalityId, grantedByUserId: input.grantedByUserId },
    });
  }

  /** Cierra las sesiones abiertas del usuario y consume sus tokens de refresco. */
  async endSessions(tx: Tx, where: { userId?: string; sessionId?: string }, reason: SessionEndReasonCode = SESSION_END_REASONS.SIGN_OUT) {
    const reasonId = await this.ids.of('session_end_reasons', reason, tx);
    const sessions = await tx.session.findMany({
      where: { ...(where.userId ? { userId: where.userId } : {}), ...(where.sessionId ? { id: where.sessionId } : {}), endedAt: null },
      select: { id: true },
    });
    if (!sessions.length) return;
    const sessionIds = sessions.map((s) => s.id);
    const now = new Date();
    await tx.refreshToken.updateMany({ where: { sessionId: { in: sessionIds }, consumedAt: null }, data: { consumedAt: now } });
    await tx.session.updateMany({ where: { id: { in: sessionIds }, endedAt: null }, data: { endedAt: now, endReasonId: reasonId } });
  }
}
