import { IdentityErrors } from '../../../domain/identity.errors';
import { Account, AccountRepository } from '../../../domain/ports/account.repository';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { RoleCode } from '../../../domain/identity.codes';

export interface PersonInput {
  givenNames: string;
  familyNames: string;
  documentType: string;
  documentNumber: string;
  phone: string;
}

/**
 * Reglas comunes al crear personal o domiciliarios: número y documento únicos. Si el número ya es de un
 * cliente (solo CUSTOMER), se reutiliza su cuenta y se le agrega el rol: una persona, una cuenta.
 */
export async function resolvePerson(
  input: PersonInput,
  role: RoleCode,
  accounts: AccountRepository,
): Promise<{ phone: PhoneNumber; existing: Account | null; documentNumber: string }> {
  const phone = PhoneNumber.parse(input.phone);
  const documentNumber = input.documentNumber.replace(/[\s.]/g, '').toUpperCase();
  const existing = await accounts.findByPhone(phone);
  if (existing) {
    if (existing.roles.some((r) => r.code === role)) throw IdentityErrors.alreadyHasRole();
    if (existing.roles.some((r) => r.requiresPassword) || !existing.canSignIn) throw IdentityErrors.phoneAlreadyRegistered();
  }
  if (await accounts.documentInUse(input.documentType, documentNumber, existing?.personId)) {
    throw IdentityErrors.documentAlreadyRegistered();
  }
  return { phone, existing, documentNumber };
}
