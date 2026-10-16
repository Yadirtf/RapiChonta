import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionDeniedError } from '../../../../../shared/domain/domain.error';
import { Principal } from '../../../domain/principal';
import { RequirePermissions, Roles } from '../decorators/auth.decorators';
import { AuthorizationGuard } from './authorization.guard';

class Endpoints {
  @Roles('ADMIN', 'OPERATOR')
  panel() {}

  @RequirePermissions('couriers.manage')
  couriers() {}

  open() {}
}

const context = (handler: keyof Endpoints, principal?: Partial<Principal>): ExecutionContext =>
  ({
    getHandler: () => Endpoints.prototype[handler],
    getClass: () => Endpoints,
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
  }) as unknown as ExecutionContext;

describe('AuthorizationGuard (H01.2)', () => {
  const guard = new AuthorizationGuard(new Reflector());
  const as = (role: Principal['role'], permissions: string[] = []) => ({ role, permissions: new Set(permissions) });

  it('deja pasar cuando el endpoint no exige rol ni permiso', () => {
    expect(guard.canActivate(context('open', as('CUSTOMER')))).toBe(true);
  });

  it('valida el rol activo de la sesión', () => {
    expect(guard.canActivate(context('panel', as('OPERATOR')))).toBe(true);
    expect(() => guard.canActivate(context('panel', as('CUSTOMER')))).toThrow(PermissionDeniedError);
    // Un domiciliario en modo cliente no conserva permisos de domiciliario.
    expect(() => guard.canActivate(context('panel', as('COURIER')))).toThrow(PermissionDeniedError);
  });

  it('valida los permisos del rol: el operador no ve opciones del administrador', () => {
    expect(guard.canActivate(context('couriers', as('ADMIN', ['couriers.manage'])))).toBe(true);
    expect(() => guard.canActivate(context('couriers', as('OPERATOR', ['orders.assign'])))).toThrow(
      expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    );
  });
});
