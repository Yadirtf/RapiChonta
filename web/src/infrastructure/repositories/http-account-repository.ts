import type { Account, LegalDocumentVersion } from "@/core/domain/entities/account";
import type { SentCode } from "@/core/domain/entities/session";
import type { AccountRepository } from "@/core/domain/repositories/account-repository";
import { currentDevice } from "../auth/device";
import { webSession } from "../auth/web-session";
import { apiGet, apiRequest } from "../http/api-client";

export class HttpAccountRepository implements AccountRepository {
  me() {
    return apiRequest<Account>("GET", "/me");
  }

  updateProfile(givenNames: string, familyNames: string | null) {
    return apiRequest<Account>("PATCH", "/me/profile", { body: { givenNames, familyNames } });
  }

  setLanguage(language: string) {
    return apiRequest<Account>("PUT", "/me/language", { body: { language } });
  }

  requestPhoneChange(phone: string, language: string) {
    return apiRequest<SentCode>("POST", "/me/phone/otp", { body: { phone, language, channel: "SMS" } });
  }

  confirmPhoneChange(challengeId: string, code: string) {
    return apiRequest<Account>("POST", "/me/phone/verify", { body: { challengeId, code, device: currentDevice() } });
  }

  acceptConsents(legalDocumentVersionIds: string[]) {
    return apiRequest<Account>("POST", "/me/consents", { body: { legalDocumentVersionIds } });
  }

  changePassword(currentPassword: string, newPassword: string) {
    return apiRequest<void>("PUT", "/me/password", { body: { currentPassword, newPassword } });
  }

  async deleteMyData() {
    await apiRequest<void>("POST", "/me/data-deletion", { body: { confirmation: "DELETE_MY_DATA" } });
    webSession.end();
  }

  currentLegalVersions() {
    return apiGet<LegalDocumentVersion[]>("/legal/current", { role: "CUSTOMER" });
  }
}
