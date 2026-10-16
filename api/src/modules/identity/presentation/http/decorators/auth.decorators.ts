import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { RoleCode } from '../../../domain/identity.codes';
import { Principal } from '../../../domain/principal';

export const REQUIRED_ROLES = 'identity:roles';
export const REQUIRED_PERMISSIONS = 'identity:permissions';

export { IS_PUBLIC, Public } from '../../../../../shared/presentation/public.decorator';

/** El rol activo de la sesión debe ser uno de estos (H01.2). */
export const Roles = (...roles: RoleCode[]) => SetMetadata(REQUIRED_ROLES, roles);

/** El rol activo debe tener todos estos permisos (role_permissions). */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

/** Inyecta el usuario autenticado en el controlador. */
export const CurrentPrincipal = createParamDecorator((_: unknown, context: ExecutionContext): Principal => {
  const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  if (!principal) throw new Error('CurrentPrincipal usado en un endpoint público');
  return principal;
});
