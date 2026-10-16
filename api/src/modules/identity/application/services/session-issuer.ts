import { Injectable } from '@nestjs/common';
import { RoleCode } from '../../domain/identity.codes';
import { DeviceInfo, SessionRepository } from '../../domain/ports/session.repository';
import { RefreshTokenGenerator, TokenService } from '../../domain/ports/token.port';

export const REFRESH_TOKEN_TTL_DAYS = 30;

export interface IssuedSession {
  sessionId: string;
  role: RoleCode;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export const refreshExpiry = (from = new Date()) => new Date(from.getTime() + REFRESH_TOKEN_TTL_DAYS * 86_400_000);

/** Abre una sesión (RF-02): token de acceso de 15 min y token de refresco rotativo de 30 días. */
@Injectable()
export class SessionIssuer {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenGenerator,
  ) {}

  async open(userId: string, role: RoleCode, device?: DeviceInfo): Promise<IssuedSession> {
    const refresh = this.refreshTokens.generate();
    const refreshTokenExpiresAt = refreshExpiry();
    const sessionId = await this.sessions.create({
      userId,
      role,
      device,
      refreshTokenHash: refresh.hash,
      refreshExpiresAt: refreshTokenExpiresAt,
    });
    const access = await this.tokens.signAccessToken({ userId, sessionId, role });
    return {
      sessionId,
      role,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt,
    };
  }
}
