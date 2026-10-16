import { Prisma } from '@prisma/client';
import { RoleCode, UserStatusCode } from '../../domain/identity.codes';
import { Account } from '../../domain/ports/account.repository';
import { PhoneNumber } from '../../domain/value-objects/phone-number';

/** Lo que hay que leer de `users` para armar una Account. */
export const ACCOUNT_INCLUDE = {
  person: { include: { phones: { where: { isPrimary: true } } } },
  status: true,
  roles: { where: { revokedAt: null }, include: { role: true } },
  preference: { include: { language: true } },
} satisfies Prisma.UserInclude;

export type UserWithAccount = Prisma.UserGetPayload<{ include: typeof ACCOUNT_INCLUDE }>;

export function toAccount(user: UserWithAccount): Account {
  const phone = user.person.phones[0]?.phoneE164;
  return {
    userId: user.id,
    personId: user.personId,
    givenNames: user.person.givenNames,
    familyNames: user.person.familyNames,
    phone: phone ? PhoneNumber.fromTrusted(phone) : null,
    status: user.status.code as UserStatusCode,
    canSignIn: user.status.canSignIn,
    passwordHash: user.passwordHash,
    roles: user.roles
      .filter((ur) => !ur.role.deactivatedAt)
      .sort((a, b) => a.role.sortOrder - b.role.sortOrder)
      .map((ur) => ({
        code: ur.role.code as RoleCode,
        municipalityId: ur.municipalityId,
        requiresPassword: ur.role.requiresPassword,
      })),
    language: user.preference?.language.code ?? 'es',
  };
}
