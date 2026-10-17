import { Account } from '../../domain/ports/account.repository';
import { LegalDocumentVersion } from '../../domain/ports/legal.repository';
import { RoleCode } from '../../domain/identity.codes';

/** Lo que la web y la app saben del usuario autenticado. */
export interface AccountView {
  userId: string;
  givenNames: string;
  familyNames: string | null;
  phone: string | null;
  language: string;
  displayCurrency: string | null;
  roles: RoleCode[];
  activeRole: RoleCode;
  permissions: string[];
  pendingConsents: { id: string; documentType: string; versionLabel: string }[];
}

export const toAccountView = (
  account: Account,
  activeRole: RoleCode,
  permissions: ReadonlySet<string>,
  pending: LegalDocumentVersion[],
): AccountView => ({
  userId: account.userId,
  givenNames: account.givenNames,
  familyNames: account.familyNames,
  phone: account.phone?.e164 ?? null,
  language: account.language,
  displayCurrency: account.displayCurrency,
  roles: account.roles.map((r) => r.code),
  activeRole,
  permissions: [...permissions].sort(),
  pendingConsents: pending.map(({ id, documentType, versionLabel }) => ({ id, documentType, versionLabel })),
});
