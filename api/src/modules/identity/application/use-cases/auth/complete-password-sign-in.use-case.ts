import { Injectable } from '@nestjs/common';
import { OTP_PURPOSES, RoleCode, STAFF_ROLE_PRIORITY } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { DeviceInfo } from '../../../domain/ports/session.repository';
import { OtpService } from '../../services/otp.service';
import { SignedIn, SignInFinisher } from '../../services/signed-in';

/** Segundo paso del ingreso con contraseña: el código del celular. Abre la sesión con un rol que exige contraseña. */
@Injectable()
export class CompletePasswordSignInUseCase {
  constructor(
    private readonly otp: OtpService,
    private readonly accounts: AccountRepository,
    private readonly finisher: SignInFinisher,
  ) {}

  async execute(input: {
    challengeId: string;
    code: string;
    role?: RoleCode;
    device?: DeviceInfo;
    ipAddress?: string;
  }): Promise<SignedIn> {
    const phone = await this.otp.verify({ ...input, purpose: OTP_PURPOSES.STAFF_SIGN_IN });
    const account = await this.accounts.findByPhone(phone);
    if (!account) throw IdentityErrors.invalidCredentials();
    if (!account.canSignIn) throw IdentityErrors.accountDisabled();

    const passwordRoles = account.roles.filter((r) => r.requiresPassword).map((r) => r.code);
    const role = input.role ?? STAFF_ROLE_PRIORITY.find((code) => passwordRoles.includes(code));
    if (!role || !passwordRoles.includes(role)) throw IdentityErrors.roleNotGranted();

    await this.accounts.markPhoneVerified(phone);
    return this.finisher.finish(account, role, input.device);
  }
}
