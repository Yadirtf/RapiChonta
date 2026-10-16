import { Injectable } from '@nestjs/common';
import { IdentityErrors } from '../../../domain/identity.errors';
import { Principal } from '../../../domain/principal';
import { RolePermissions } from '../../../domain/ports/role-permissions.port';
import { SessionRepository } from '../../../domain/ports/session.repository';
import { TokenService } from '../../../domain/ports/token.port';

/**
 * Valida el token de acceso de cada petición y que su sesión siga abierta: desactivar una cuenta o
 * cerrar sesión surte efecto de inmediato, sin esperar a que venza el token de 15 minutos.
 */
@Injectable()
export class AuthenticateUseCase {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionRepository,
    private readonly permissions: RolePermissions,
  ) {}

  async execute(accessToken: string): Promise<Principal> {
    const claims = await this.tokens.verifyAccessToken(accessToken);
    if (!claims) throw IdentityErrors.sessionInvalid();
    const session = await this.sessions.findActive(claims.sessionId);
    if (!session || session.userId !== claims.userId || session.role !== claims.role) throw IdentityErrors.sessionInvalid();
    if (!session.canSignIn) throw IdentityErrors.accountDisabled();
    if (!session.roleStillGranted) throw IdentityErrors.sessionInvalid();
    return {
      userId: claims.userId,
      sessionId: claims.sessionId,
      role: claims.role,
      permissions: this.permissions.permissionsOf(claims.role),
      municipalityId: session.municipalityId,
    };
  }
}
