import type { Account, RoleCode } from "@/core/domain/entities/account";
import type { AccessToken, CodeVerification, SentCode, SignedIn } from "@/core/domain/entities/session";
import type { AuthRepository } from "@/core/domain/repositories/auth-repository";
import { currentDevice } from "../auth/device";
import { webSession } from "../auth/web-session";
import { apiRequest } from "../http/api-client";

/** Adaptador HTTP de autenticación. Guarda el token de acceso en la sesión de la web al entrar. */
export class HttpAuthRepository implements AuthRepository {
  requestCode(phone: string, language: string) {
    return apiRequest<SentCode>("POST", "/auth/otp", { auth: false, body: { phone, language, channel: "SMS" } });
  }

  async verifyCode(challengeId: string, code: string) {
    const result = await apiRequest<CodeVerification>("POST", "/auth/otp/verify", {
      auth: false,
      body: { challengeId, code, device: currentDevice() },
    });
    if (result.status === "SIGNED_IN") webSession.start(result);
    return result;
  }

  async register(input: Parameters<AuthRepository["register"]>[0]) {
    return this.signedIn(
      apiRequest<SignedIn>("POST", "/auth/register", {
        auth: false,
        body: { ...input, familyNames: input.familyNames || undefined, device: currentDevice() },
      }),
    );
  }

  startPasswordSignIn(phone: string, password: string, language: string) {
    return apiRequest<SentCode>("POST", "/auth/password", { auth: false, body: { phone, password, language, channel: "SMS" } });
  }

  completePasswordSignIn(challengeId: string, code: string) {
    return this.signedIn(
      apiRequest<SignedIn>("POST", "/auth/password/verify", { auth: false, body: { challengeId, code, device: currentDevice() } }),
    );
  }

  async switchRole(role: RoleCode, password?: string) {
    const result = await apiRequest<AccessToken & { account: Account }>("POST", "/auth/switch-role", { body: { role, password } });
    webSession.start(result);
    return result;
  }

  async signOut() {
    try {
      await apiRequest<void>("POST", "/auth/sign-out", { auth: false, body: {} });
    } finally {
      webSession.end();
    }
  }

  private async signedIn(request: Promise<SignedIn>) {
    const result = await request;
    webSession.start(result);
    return result;
  }
}
