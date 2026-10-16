import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionDeniedError } from '../../../../../shared/domain/domain.error';
import { RoleCode } from '../../../domain/identity.codes';
import { AuthenticatedRequest, REQUIRED_PERMISSIONS, REQUIRED_ROLES } from '../decorators/auth.decorators';

/**
 * Guard global de autorización (H01.2): verifica el rol activo (@Roles) y sus permisos (@RequirePermissions).
 * La regla de propiedad ("un cliente solo ve sus pedidos" → 404) es del caso de uso, no de este guard.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<RoleCode[] | undefined>(REQUIRED_ROLES, targets);
    const permissions = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_PERMISSIONS, targets);
    if (!roles?.length && !permissions?.length) return true;

    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw new PermissionDeniedError();
    if (roles?.length && !roles.includes(principal.role)) throw new PermissionDeniedError('ROLE_NOT_ALLOWED');
    if (permissions?.some((permission) => !principal.permissions.has(permission))) {
      throw new PermissionDeniedError('PERMISSION_DENIED');
    }
    return true;
  }
}
