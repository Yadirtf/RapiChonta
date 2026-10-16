import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ROLE_CODES, RoleCode } from '../../domain/identity.codes';
import { AccessTokenClaims, RegistrationTicketClaims, SignedToken, TokenService } from '../../domain/ports/token.port';

const ACCESS_TTL_SECONDS = 15 * 60;
const REGISTRATION_TTL_SECONDS = 15 * 60;
const ISSUER = 'rapichonta-api';

interface AccessPayload {
  sub: string;
  sid: string;
  role: RoleCode;
  typ: 'access';
}

interface RegistrationPayload {
  phone: string;
  cid: string;
  typ: 'registration';
}

/** JWT HS256 firmados con JWT_SECRET. `typ` impide usar un boleto de registro como token de acceso. */
@Injectable()
export class JwtTokenService extends TokenService {
  constructor(private readonly jwt: JwtService) {
    super();
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<SignedToken> {
    const payload: AccessPayload = { sub: claims.userId, sid: claims.sessionId, role: claims.role, typ: 'access' };
    return this.sign(payload, ACCESS_TTL_SECONDS);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    const payload = await this.verify<AccessPayload>(token);
    if (payload?.typ !== 'access' || !ROLE_CODES.includes(payload.role)) return null;
    return { userId: payload.sub, sessionId: payload.sid, role: payload.role };
  }

  async signRegistrationTicket(claims: RegistrationTicketClaims): Promise<SignedToken> {
    return this.sign({ phone: claims.phoneE164, cid: claims.challengeId, typ: 'registration' }, REGISTRATION_TTL_SECONDS);
  }

  async verifyRegistrationTicket(token: string): Promise<RegistrationTicketClaims | null> {
    const payload = await this.verify<RegistrationPayload>(token);
    if (payload?.typ !== 'registration') return null;
    return { phoneE164: payload.phone, challengeId: payload.cid };
  }

  private async sign(payload: object, ttlSeconds: number): Promise<SignedToken> {
    const token = await this.jwt.signAsync({ ...payload }, { expiresIn: ttlSeconds, issuer: ISSUER, algorithm: 'HS256' });
    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  private async verify<T extends object>(token: string): Promise<T | null> {
    try {
      return await this.jwt.verifyAsync<T>(token, { issuer: ISSUER, algorithms: ['HS256'] });
    } catch {
      return null;
    }
  }
}
