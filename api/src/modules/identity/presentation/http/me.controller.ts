import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Put, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AcceptConsentsUseCase } from '../../application/use-cases/account/accept-consents.use-case';
import { ChangeMyPasswordUseCase } from '../../application/use-cases/account/change-my-password.use-case';
import { ChangeMyPhoneUseCase } from '../../application/use-cases/account/change-my-phone.use-case';
import { DeleteMyDataUseCase } from '../../application/use-cases/account/delete-my-data.use-case';
import { GetMyAccountUseCase } from '../../application/use-cases/account/get-my-account.use-case';
import { SetMyDisplayCurrencyUseCase, SetMyLanguageUseCase } from '../../application/use-cases/account/set-my-language.use-case';
import { UpdateMyProfileUseCase } from '../../application/use-cases/account/update-my-profile.use-case';
import { PERMISSIONS } from '../../domain/identity.codes';
import { Principal } from '../../domain/principal';
import { CurrentPrincipal, RequirePermissions } from './decorators/auth.decorators';
import { AcceptConsentsDto, ChangePasswordDto, DeleteDataDto, SetDisplayCurrencyDto, SetLanguageDto, UpdateProfileDto } from './dto/account.dto';
import { RequestCodeDto, VerifyCodeDto } from './dto/auth.dto';
import { clearRefreshCookie } from './refresh-cookie';

/** H01.5: Mi cuenta. Cada usuario solo opera sobre su propia cuenta (el id sale de la sesión, nunca de la URL). */
@Controller('me')
@RequirePermissions(PERMISSIONS.ACCOUNT_MANAGE_OWN)
export class MeController {
  constructor(
    private readonly getAccount: GetMyAccountUseCase,
    private readonly updateProfile: UpdateMyProfileUseCase,
    private readonly setLanguage: SetMyLanguageUseCase,
    private readonly setDisplayCurrency: SetMyDisplayCurrencyUseCase,
    private readonly changePhone: ChangeMyPhoneUseCase,
    private readonly acceptConsents: AcceptConsentsUseCase,
    private readonly changePassword: ChangeMyPasswordUseCase,
    private readonly deleteData: DeleteMyDataUseCase,
  ) {}

  @Get()
  me(@CurrentPrincipal() principal: Principal) {
    return this.getAccount.execute(principal);
  }

  @Patch('profile')
  async profile(@CurrentPrincipal() principal: Principal, @Body() body: UpdateProfileDto) {
    await this.updateProfile.execute(principal, body);
    return this.getAccount.execute(principal);
  }

  @Put('language')
  async language(@CurrentPrincipal() principal: Principal, @Body() body: SetLanguageDto) {
    await this.setLanguage.execute(principal, body.language);
    return this.getAccount.execute(principal);
  }

  /** H03.4: el precio aproximado en USD o EUR se recuerda en la cuenta (sin sesión, en el dispositivo). */
  @Put('display-currency')
  async displayCurrency(@CurrentPrincipal() principal: Principal, @Body() body: SetDisplayCurrencyDto) {
    await this.setDisplayCurrency.execute(principal, body.currency ?? null);
    return this.getAccount.execute(principal);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('phone/otp')
  phoneCode(@CurrentPrincipal() principal: Principal, @Body() body: RequestCodeDto, @Req() request: Request) {
    return this.changePhone.requestCode(principal, { ...body, ipAddress: request.ip });
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  async phoneVerify(@CurrentPrincipal() principal: Principal, @Body() body: VerifyCodeDto, @Req() request: Request) {
    await this.changePhone.confirm(principal, { ...body, ipAddress: request.ip });
    return this.getAccount.execute(principal);
  }

  @Post('consents')
  @HttpCode(HttpStatus.OK)
  async consents(@CurrentPrincipal() principal: Principal, @Body() body: AcceptConsentsDto, @Req() request: Request) {
    await this.acceptConsents.execute(principal, body.legalDocumentVersionIds, request.ip);
    return this.getAccount.execute(principal);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Put('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async password(@CurrentPrincipal() principal: Principal, @Body() body: ChangePasswordDto, @Req() request: Request) {
    await this.changePassword.execute(principal, { ...body, ipAddress: request.ip });
  }

  /** Eliminación de datos (habeas data): anonimiza y cierra la cuenta. */
  @Post('data-deletion')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dataDeletion(
    @CurrentPrincipal() principal: Principal,
    @Body() _body: DeleteDataDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.deleteData.execute(principal);
    clearRefreshCookie(response);
  }
}
