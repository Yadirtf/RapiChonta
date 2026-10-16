import { Injectable } from '@nestjs/common';
import { SESSION_END_REASONS } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { SessionRepository } from '../../../domain/ports/session.repository';
import { RefreshTokenGenerator, TokenService } from '../../../domain/ports/token.port';
import { IssuedSession, refreshExpiry } from '../../services/session-issuer';

/**
 * RF-02: rota el token de refresco. Un token ya usado significa que alguien lo copió: se cierra la sesión
 * completa (REFRESH_REUSE_DETECTED). También se cierra si la cuenta se desactivó o el rol se revocó.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenGenerator,
  ) {}

  async execute(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw IdentityErrors.sessionInvalid();
    const stored = await this.sessions.findRefreshToken(this.refreshTokens.hash(refreshToken));
    if (!stored || stored.sessionEndedAt) throw IdentityErrors.sessionInvalid();

    if (stored.consumedAt) {
      await this.sessions.end(stored.sessionId, SESSION_END_REASONS.REFRESH_REUSE_DETECTED);
      throw IdentityErrors.refreshReused();
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      await this.sessions.end(stored.sessionId, SESSION_END_REASONS.EXPIRED);
      throw IdentityErrors.sessionInvalid();
    }

    const active = await this.sessions.findActive(stored.sessionId);
    if (!active) throw IdentityErrors.sessionInvalid();
    if (!active.canSignIn) {
      await this.sessions.end(stored.sessionId, SESSION_END_REASONS.ACCOUNT_DISABLED);
      throw IdentityErrors.accountDisabled();
    }
    if (!active.roleStillGranted) {
      await this.sessions.end(stored.sessionId, SESSION_END_REASONS.ROLE_REVOKED);
      throw IdentityErrors.sessionInvalid();
    }

    const next = this.refreshTokens.generate();
    const refreshTokenExpiresAt = refreshExpiry();
    const rotated = await this.sessions.rotate({
      tokenId: stored.id,
      sessionId: stored.sessionId,
      newHash: next.hash,
      expiresAt: refreshTokenExpiresAt,
    });
    if (!rotated) {
      // Dos refrescos con el mismo token a la vez: se trata como reutilización.
      await this.sessions.end(stored.sessionId, SESSION_END_REASONS.REFRESH_REUSE_DETECTED);
      throw IdentityErrors.refreshReused();
    }

    const access = await this.tokens.signAccessToken({ userId: stored.userId, sessionId: stored.sessionId, role: stored.role });
    return {
      sessionId: stored.sessionId,
      role: stored.role,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: next.token,
      refreshTokenExpiresAt,
    };
  }
}
