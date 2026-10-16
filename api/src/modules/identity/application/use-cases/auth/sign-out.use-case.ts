import { Injectable } from '@nestjs/common';
import { SESSION_END_REASONS } from '../../../domain/identity.codes';
import { SessionRepository } from '../../../domain/ports/session.repository';
import { RefreshTokenGenerator } from '../../../domain/ports/token.port';

/** H01.1: cerrar sesión revoca el token de refresco en la base de datos. Es idempotente. */
@Injectable()
export class SignOutUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly refreshTokens: RefreshTokenGenerator,
  ) {}

  async execute(input: { refreshToken?: string; sessionId?: string }): Promise<void> {
    let sessionId = input.sessionId;
    if (!sessionId && input.refreshToken) {
      sessionId = (await this.sessions.findRefreshToken(this.refreshTokens.hash(input.refreshToken)))?.sessionId;
    }
    if (sessionId) await this.sessions.end(sessionId, SESSION_END_REASONS.SIGN_OUT);
  }
}
