import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticateUseCase } from '../../../application/use-cases/auth/authenticate.use-case';
import { IdentityErrors } from '../../../domain/identity.errors';
import { AuthenticatedRequest, IS_PUBLIC } from '../decorators/auth.decorators';

/** Guard global: exige `Authorization: Bearer <token de acceso>` salvo en endpoints marcados con @Public(). */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticate: AuthenticateUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw IdentityErrors.sessionInvalid();
    request.principal = await this.authenticate.execute(token);
    return true;
  }
}
