import type { Account, LegalDocumentVersion } from "../entities/account";
import type { SentCode } from "../entities/session";

/** Mi cuenta (H01.5): todo opera sobre el usuario de la sesión. */
export interface AccountRepository {
  me(): Promise<Account>;
  updateProfile(givenNames: string, familyNames: string | null): Promise<Account>;
  setLanguage(language: string): Promise<Account>;
  requestPhoneChange(phone: string, language: string): Promise<SentCode>;
  confirmPhoneChange(challengeId: string, code: string): Promise<Account>;
  acceptConsents(legalDocumentVersionIds: string[]): Promise<Account>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  deleteMyData(): Promise<void>;
  currentLegalVersions(): Promise<LegalDocumentVersion[]>;
}
