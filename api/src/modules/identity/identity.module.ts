import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { OtpService } from './application/services/otp.service';
import { SessionIssuer } from './application/services/session-issuer';
import { SignInFinisher } from './application/services/signed-in';
import { AcceptConsentsUseCase } from './application/use-cases/account/accept-consents.use-case';
import { ChangeMyPasswordUseCase } from './application/use-cases/account/change-my-password.use-case';
import { ChangeMyPhoneUseCase } from './application/use-cases/account/change-my-phone.use-case';
import { DeleteMyDataUseCase } from './application/use-cases/account/delete-my-data.use-case';
import { GetMyAccountUseCase } from './application/use-cases/account/get-my-account.use-case';
import { SetMyDisplayCurrencyUseCase, SetMyLanguageUseCase } from './application/use-cases/account/set-my-language.use-case';
import { UpdateMyProfileUseCase } from './application/use-cases/account/update-my-profile.use-case';
import { ChangeCourierMunicipalityUseCase } from './application/use-cases/admin/change-courier-municipality.use-case';
import { ChangeCourierVerificationUseCase } from './application/use-cases/admin/change-courier-verification.use-case';
import { ChangeUserStatusUseCase } from './application/use-cases/admin/change-user-status.use-case';
import { CreateCourierUseCase } from './application/use-cases/admin/create-courier.use-case';
import { CreateStaffMemberUseCase, ListStaffUseCase } from './application/use-cases/admin/create-staff-member.use-case';
import { GetCourierUseCase, ListCouriersUseCase } from './application/use-cases/admin/list-couriers.use-case';
import { AuthenticateUseCase } from './application/use-cases/auth/authenticate.use-case';
import { CompletePasswordSignInUseCase } from './application/use-cases/auth/complete-password-sign-in.use-case';
import { RefreshSessionUseCase } from './application/use-cases/auth/refresh-session.use-case';
import { RegisterCustomerUseCase } from './application/use-cases/auth/register-customer.use-case';
import { RequestSignInCodeUseCase } from './application/use-cases/auth/request-sign-in-code.use-case';
import { SignOutUseCase } from './application/use-cases/auth/sign-out.use-case';
import { StartPasswordSignInUseCase } from './application/use-cases/auth/start-password-sign-in.use-case';
import { SwitchRoleUseCase } from './application/use-cases/auth/switch-role.use-case';
import { VerifySignInCodeUseCase } from './application/use-cases/auth/verify-sign-in-code.use-case';
import { AccountRepository } from './domain/ports/account.repository';
import { CourierRepository } from './domain/ports/courier.repository';
import { IdentityOptionsRepository } from './domain/ports/identity-options.repository';
import { IdentitySettings } from './domain/ports/identity-settings.port';
import { LegalRepository } from './domain/ports/legal.repository';
import { OtpChallengeRepository } from './domain/ports/otp-challenge.repository';
import { OtpProvider } from './domain/ports/otp-provider.port';
import { PasswordHasher } from './domain/ports/password-hasher.port';
import { RolePermissions } from './domain/ports/role-permissions.port';
import { SessionRepository } from './domain/ports/session.repository';
import { StaffRepository } from './domain/ports/staff.repository';
import { RefreshTokenGenerator, TokenService } from './domain/ports/token.port';
import { IdentityCatalog } from './infrastructure/catalog/identity-catalog';
import { PrismaIdentitySettings } from './infrastructure/catalog/prisma-identity-settings';
import { LocalOtpProvider } from './infrastructure/otp/local-otp.provider';
import { TwilioVerifyOtpProvider } from './infrastructure/otp/twilio-verify-otp.provider';
import { PrismaAccountRepository } from './infrastructure/persistence/prisma-account.repository';
import { PrismaCourierRepository } from './infrastructure/persistence/prisma-courier.repository';
import { PrismaIdentityOptionsRepository } from './infrastructure/persistence/prisma-identity-options.repository';
import { PrismaLegalRepository } from './infrastructure/persistence/prisma-legal.repository';
import { PrismaOtpChallengeRepository } from './infrastructure/persistence/prisma-otp-challenge.repository';
import { PrismaSessionRepository } from './infrastructure/persistence/prisma-session.repository';
import { PrismaStaffRepository } from './infrastructure/persistence/prisma-staff.repository';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password.hasher';
import { JwtTokenService } from './infrastructure/security/jwt-token.service';
import { RandomRefreshTokenGenerator } from './infrastructure/security/random-refresh-token.generator';
import { AdminIdentityController } from './presentation/http/admin.controller';
import { AuthController } from './presentation/http/auth.controller';
import { LegalController } from './presentation/http/legal.controller';
import { MeController } from './presentation/http/me.controller';
import { AuthenticationGuard } from './presentation/http/guards/authentication.guard';
import { AuthorizationGuard } from './presentation/http/guards/authorization.guard';

const DEV_SECRET = 'dev-only-secret-change-me-dev-only-secret';

/** JWT_SECRET obligatorio y largo en producción; en desarrollo se usa uno fijo con aviso. */
export function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  const production = config.get<string>('NODE_ENV') === 'production';
  if (secret && secret.length >= 32 && secret !== 'cambia-esto') return secret;
  if (production) throw new Error('JWT_SECRET debe tener al menos 32 caracteres (openssl rand -hex 32)');
  new Logger('IdentityModule').warn('JWT_SECRET no definido o corto: se usa un secreto de desarrollo');
  return DEV_SECRET;
}

/** Proveedor de códigos: Twilio Verify si está configurado; si no, el código va al log (y, en pruebas, a la respuesta). */
function otpProviderFactory(config: ConfigService): OtpProvider {
  const provider = config.get<string>('OTP_PROVIDER') ?? 'console';
  const logger = new Logger('IdentityModule');
  if (provider === 'twilio') {
    const accountSid = config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = config.get<string>('TWILIO_AUTH_TOKEN');
    const serviceSid = config.get<string>('TWILIO_VERIFY_SERVICE_SID');
    if (!accountSid || !authToken || !serviceSid) throw new Error('OTP_PROVIDER=twilio exige TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_VERIFY_SERVICE_SID');
    return new TwilioVerifyOtpProvider({ accountSid, authToken, serviceSid });
  }
  const exposeCode = config.get<string>('OTP_EXPOSE_CODE') === 'true';
  if (exposeCode) logger.warn('OTP_EXPOSE_CODE=true: el código se devuelve en la respuesta. Solo para pruebas.');
  return new LocalOtpProvider({ pepper: config.get<string>('OTP_PEPPER') ?? resolveJwtSecret(config), exposeCode });
}

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: resolveJwtSecret(config) }),
    }),
  ],
  controllers: [AuthController, MeController, AdminIdentityController, LegalController],
  providers: [
    // Puertos → adaptadores
    { provide: AccountRepository, useClass: PrismaAccountRepository },
    { provide: SessionRepository, useClass: PrismaSessionRepository },
    { provide: OtpChallengeRepository, useClass: PrismaOtpChallengeRepository },
    { provide: LegalRepository, useClass: PrismaLegalRepository },
    { provide: CourierRepository, useClass: PrismaCourierRepository },
    { provide: StaffRepository, useClass: PrismaStaffRepository },
    { provide: IdentityOptionsRepository, useClass: PrismaIdentityOptionsRepository },
    { provide: IdentitySettings, useClass: PrismaIdentitySettings },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: TokenService, useClass: JwtTokenService },
    { provide: RefreshTokenGenerator, useClass: RandomRefreshTokenGenerator },
    { provide: OtpProvider, inject: [ConfigService], useFactory: otpProviderFactory },
    IdentityCatalog,
    { provide: RolePermissions, useExisting: IdentityCatalog },
    // Servicios de aplicación y casos de uso
    OtpService,
    SessionIssuer,
    SignInFinisher,
    AuthenticateUseCase,
    RequestSignInCodeUseCase,
    VerifySignInCodeUseCase,
    RegisterCustomerUseCase,
    StartPasswordSignInUseCase,
    CompletePasswordSignInUseCase,
    RefreshSessionUseCase,
    SignOutUseCase,
    SwitchRoleUseCase,
    GetMyAccountUseCase,
    UpdateMyProfileUseCase,
    SetMyLanguageUseCase,
    SetMyDisplayCurrencyUseCase,
    ChangeMyPhoneUseCase,
    AcceptConsentsUseCase,
    ChangeMyPasswordUseCase,
    DeleteMyDataUseCase,
    CreateCourierUseCase,
    ListCouriersUseCase,
    GetCourierUseCase,
    ChangeCourierVerificationUseCase,
    ChangeCourierMunicipalityUseCase,
    ChangeUserStatusUseCase,
    CreateStaffMemberUseCase,
    ListStaffUseCase,
    // Seguro por defecto: toda ruta exige sesión salvo @Public(); luego se verifican rol y permisos.
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
  ],
  exports: [AuthenticateUseCase, RolePermissions, CreateStaffMemberUseCase],
})
export class IdentityModule {}
