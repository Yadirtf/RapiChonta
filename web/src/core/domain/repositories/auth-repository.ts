import type { Account, RoleCode } from "../entities/account";
import type { AccessToken, CodeVerification, SentCode, SignedIn } from "../entities/session";

/** Puerto de autenticación: la vista no sabe de URLs, cookies ni dispositivos. */
export interface AuthRepository {
  requestCode(phone: string, language: string): Promise<SentCode>;
  verifyCode(challengeId: string, code: string): Promise<CodeVerification>;
  register(input: {
    registrationToken: string;
    givenNames: string;
    familyNames?: string;
    acceptedLegalVersionIds: string[];
    language: string;
  }): Promise<SignedIn>;
  startPasswordSignIn(phone: string, password: string, language: string): Promise<SentCode>;
  completePasswordSignIn(challengeId: string, code: string): Promise<SignedIn>;
  switchRole(role: RoleCode, password?: string): Promise<AccessToken & { account: Account }>;
  signOut(): Promise<void>;
}
