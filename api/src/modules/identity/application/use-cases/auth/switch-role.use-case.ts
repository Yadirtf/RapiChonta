import { Injectable } from '@nestjs/common';
import { AUTH_FACTORS, RoleCode } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { Principal } from '../../../domain/principal';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { LegalRepository } from '../../../domain/ports/legal.repository';
import { OtpChallengeRepository } from '../../../domain/ports/otp-challenge.repository';
import { PasswordHasher } from '../../../domain/ports/password-hasher.port';
import { RolePermissions } from '../../../domain/ports/role-permissions.port';
import { SessionRepository } from '../../../domain/ports/session.repository';
import { TokenService } from '../../../domain/ports/token.port';
import { AccountView, toAccountView } from '../../services/account-view';

/**
 * RF-06 / H08.7: el domiciliario cambia a modo cliente (y vuelve). Cambia el rol activo de la misma sesión.
 * Pasar de un rol sin contraseña a uno que la exige pide la contraseña otra vez.
 */
@Injectable()
export class SwitchRoleUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly hasher: PasswordHasher,
    private readonly challenges: OtpChallengeRepository,
    private readonly permissions: RolePermissions,
    private readonly legal: LegalRepository,
  ) {}

  async execute(input: { principal: Principal; role: RoleCode; password?: string; ipAddress?: string }): Promise<{
    accessToken: string;
    accessTokenExpiresAt: Date;
    account: AccountView;
  }> {
    const account = await this.accounts.findById(input.principal.userId);
    if (!account) throw IdentityErrors.sessionInvalid();
    const target = account.roles.find((r) => r.code === input.role);
    if (!target) throw IdentityErrors.roleNotGranted();

    const current = account.roles.find((r) => r.code === input.principal.role);
    if (target.requiresPassword && !current?.requiresPassword) {
      if (!input.password || !account.passwordHash) throw IdentityErrors.passwordRequired();
      const valid = await this.hasher.verify(account.passwordHash, input.password);
      await this.challenges.recordAttempt({
        factor: AUTH_FACTORS.PASSWORD,
        userId: account.userId,
        succeeded: valid,
        ipAddress: input.ipAddress,
      });
      if (!valid) throw IdentityErrors.invalidCredentials();
    }

    await this.sessions.setActiveRole(input.principal.sessionId, input.role);
    const access = await this.tokens.signAccessToken({
      userId: account.userId,
      sessionId: input.principal.sessionId,
      role: input.role,
    });
    const pending = await this.legal.pendingFor(account.userId);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      account: toAccountView(account, input.role, this.permissions.permissionsOf(input.role), pending),
    };
  }
}
