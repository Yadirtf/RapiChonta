import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { SignedIn } from '../../application/services/signed-in';
import { CompletePasswordSignInUseCase } from '../../application/use-cases/auth/complete-password-sign-in.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/auth/refresh-session.use-case';
import { RegisterCustomerUseCase } from '../../application/use-cases/auth/register-customer.use-case';
import { RequestSignInCodeUseCase } from '../../application/use-cases/auth/request-sign-in-code.use-case';
import { SignOutUseCase } from '../../application/use-cases/auth/sign-out.use-case';
import { StartPasswordSignInUseCase } from '../../application/use-cases/auth/start-password-sign-in.use-case';
import { SwitchRoleUseCase } from '../../application/use-cases/auth/switch-role.use-case';
import { VerifySignInCodeUseCase } from '../../application/use-cases/auth/verify-sign-in-code.use-case';
import { Principal } from '../../domain/principal';
import { CurrentPrincipal, Public } from './decorators/auth.decorators';
import {
  CompletePasswordSignInDto,
  PasswordSignInDto,
  RefreshDto,
  RegisterDto,
  RequestCodeDto,
  SwitchRoleDto,
  VerifyCodeDto,
} from './dto/auth.dto';
import { clearRefreshCookie, isWebClient, readRefreshToken, sessionResponse } from './refresh-cookie';

/** Límite más estricto que el global (100/min) en los endpoints que envían o validan códigos (H01.1). */
const SEND_LIMIT = { default: { limit: 5, ttl: 60_000 } };
const VERIFY_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly requestCode: RequestSignInCodeUseCase,
    private readonly verifyCode: VerifySignInCodeUseCase,
    private readonly register: RegisterCustomerUseCase,
    private readonly startPassword: StartPasswordSignInUseCase,
    private readonly completePassword: CompletePasswordSignInUseCase,
    private readonly refresh: RefreshSessionUseCase,
    private readonly signOut: SignOutUseCase,
    private readonly switchRole: SwitchRoleUseCase,
  ) {}

  /** POST /api/v1/auth/otp — el cliente pide un código para su celular. */
  @Public()
  @Throttle(SEND_LIMIT)
  @Post('otp')
  async sendCode(@Body() body: RequestCodeDto, @Req() request: Request) {
    return this.requestCode.execute({ ...body, ipAddress: request.ip });
  }

  /** POST /api/v1/auth/otp/verify — entra si ya tiene cuenta; si es nuevo, pide nombre y aceptación. */
  @Public()
  @Throttle(VERIFY_LIMIT)
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: VerifyCodeDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.verifyCode.execute({ ...body, ipAddress: request.ip });
    if (result.status === 'REGISTRATION_REQUIRED') return result;
    return this.signedIn(result, response, isWebClient(body.device));
  }

  /** POST /api/v1/auth/register — primer ingreso del cliente. */
  @Public()
  @Throttle(VERIFY_LIMIT)
  @Post('register')
  async registerCustomer(@Body() body: RegisterDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.register.execute({ ...body, ipAddress: request.ip });
    return this.signedIn(result, response, isWebClient(body.device));
  }

  /** POST /api/v1/auth/password — personal y domiciliarios: contraseña; si es correcta, envía el código. */
  @Public()
  @Throttle(SEND_LIMIT)
  @Post('password')
  @HttpCode(HttpStatus.OK)
  async passwordSignIn(@Body() body: PasswordSignInDto, @Req() request: Request) {
    return this.startPassword.execute({ ...body, ipAddress: request.ip });
  }

  /** POST /api/v1/auth/password/verify — segundo factor del personal y los domiciliarios. */
  @Public()
  @Throttle(VERIFY_LIMIT)
  @Post('password/verify')
  @HttpCode(HttpStatus.OK)
  async passwordVerify(@Body() body: CompletePasswordSignInDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.completePassword.execute({ ...body, ipAddress: request.ip });
    return this.signedIn(result, response, isWebClient(body.device));
  }

  /** POST /api/v1/auth/refresh — rota el token de refresco (cookie en la web, cuerpo en la app). */
  @Public()
  @Throttle(VERIFY_LIMIT)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshSession(@Body() body: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const web = !body.refreshToken;
    try {
      const session = await this.refresh.execute(readRefreshToken(request, body.refreshToken));
      return sessionResponse(response, session, web);
    } catch (error) {
      if (web) clearRefreshCookie(response);
      throw error;
    }
  }

  /** POST /api/v1/auth/sign-out — revoca la sesión en la base de datos. */
  @Public()
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOutSession(@Body() body: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.signOut.execute({ refreshToken: readRefreshToken(request, body.refreshToken) });
    clearRefreshCookie(response);
  }

  /** POST /api/v1/auth/switch-role — modo cliente / modo domiciliario (RF-06). */
  @Post('switch-role')
  @HttpCode(HttpStatus.OK)
  async switchActiveRole(@CurrentPrincipal() principal: Principal, @Body() body: SwitchRoleDto, @Req() request: Request) {
    return this.switchRole.execute({ principal, ...body, ipAddress: request.ip });
  }

  private signedIn(result: SignedIn, response: Response, web: boolean) {
    return { status: result.status, ...sessionResponse(response, result.session, web), account: result.account };
  }
}
