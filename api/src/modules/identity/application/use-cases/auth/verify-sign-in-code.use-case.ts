import { Injectable } from '@nestjs/common';
import { OTP_PURPOSES, ROLES } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { LegalDocumentVersion, LegalRepository } from '../../../domain/ports/legal.repository';
import { DeviceInfo } from '../../../domain/ports/session.repository';
import { TokenService } from '../../../domain/ports/token.port';
import { OtpService } from '../../services/otp.service';
import { SignedIn, SignInFinisher } from '../../services/signed-in';

export interface RegistrationRequired {
  status: 'REGISTRATION_REQUIRED';
  registrationToken: string;
  registrationExpiresAt: Date;
  requiredConsents: LegalDocumentVersion[];
}

/**
 * H01.1: valida el código del cliente. Si el número ya tiene cuenta, entra como CUSTOMER (sin contraseña,
 * aunque sea domiciliario o personal: los permisos son solo los de cliente). Si es nuevo, devuelve un boleto
 * de registro para pedir el nombre y la aceptación de la política de datos.
 */
@Injectable()
export class VerifySignInCodeUseCase {
  constructor(
    private readonly otp: OtpService,
    private readonly accounts: AccountRepository,
    private readonly legal: LegalRepository,
    private readonly tokens: TokenService,
    private readonly finisher: SignInFinisher,
  ) {}

  async execute(input: {
    challengeId: string;
    code: string;
    device?: DeviceInfo;
    ipAddress?: string;
  }): Promise<SignedIn | RegistrationRequired> {
    const phone = await this.otp.verify({ ...input, purpose: OTP_PURPOSES.SIGN_IN });
    const account = await this.accounts.findByPhone(phone);

    if (!account) {
      const ticket = await this.tokens.signRegistrationTicket({ phoneE164: phone.e164, challengeId: input.challengeId });
      return {
        status: 'REGISTRATION_REQUIRED',
        registrationToken: ticket.token,
        registrationExpiresAt: ticket.expiresAt,
        requiredConsents: await this.legal.currentRequiredFor([ROLES.CUSTOMER]),
      };
    }
    if (!account.canSignIn) throw IdentityErrors.accountDisabled();

    await this.accounts.markPhoneVerified(phone);
    if (!account.roles.some((r) => r.code === ROLES.CUSTOMER)) {
      // Cualquier persona puede pedir: el rol CUSTOMER es is_self_assignable.
      await this.accounts.grantSelfAssignableRole(account.userId, ROLES.CUSTOMER);
      account.roles.push({ code: ROLES.CUSTOMER, municipalityId: null, requiresPassword: false });
    }
    return this.finisher.finish(account, ROLES.CUSTOMER, input.device);
  }
}
