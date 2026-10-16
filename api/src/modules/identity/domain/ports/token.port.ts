import { RoleCode } from '../identity.codes';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
  role: RoleCode;
}

export interface RegistrationTicketClaims {
  phoneE164: string;
  challengeId: string;
}

export interface SignedToken {
  token: string;
  expiresAt: Date;
}

/** Tokens firmados de corta vida: acceso (15 min) y boleto de registro (tras validar el código de un número nuevo). */
export abstract class TokenService {
  abstract signAccessToken(claims: AccessTokenClaims): Promise<SignedToken>;
  abstract verifyAccessToken(token: string): Promise<AccessTokenClaims | null>;
  abstract signRegistrationTicket(claims: RegistrationTicketClaims): Promise<SignedToken>;
  abstract verifyRegistrationTicket(token: string): Promise<RegistrationTicketClaims | null>;
}

/** Token de refresco opaco: solo su hash SHA-256 se guarda en refresh_tokens. */
export abstract class RefreshTokenGenerator {
  abstract generate(): { token: string; hash: string };
  abstract hash(token: string): string;
}
