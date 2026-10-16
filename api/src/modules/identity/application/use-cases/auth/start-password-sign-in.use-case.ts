import { Injectable } from '@nestjs/common';
import { AUTH_FACTORS, OTP_PURPOSES, OtpChannelCode } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { OtpChallengeRepository } from '../../../domain/ports/otp-challenge.repository';
import { PasswordHasher } from '../../../domain/ports/password-hasher.port';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { OtpService, SentOtp } from '../../services/otp.service';

export const PASSWORD_LOCK_WINDOW_MS = 15 * 60_000;
export const PASSWORD_MAX_FAILURES = 5;

/**
 * H01.4 y H01.3: personal y domiciliarios entran con contraseña + código. Este paso valida la contraseña
 * y, solo si es correcta, envía el código al celular de la cuenta. Ante cualquier fallo responde lo mismo
 * (INVALID_CREDENTIALS) para no revelar qué números tienen cuenta.
 */
@Injectable()
export class StartPasswordSignInUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly challenges: OtpChallengeRepository,
    private readonly otp: OtpService,
  ) {}

  async execute(input: {
    phone: string;
    password: string;
    channel: OtpChannelCode;
    language: string;
    ipAddress?: string;
  }): Promise<SentOtp> {
    const phone = PhoneNumber.parse(input.phone);
    const account = await this.accounts.findByPhone(phone);
    const eligible = account?.passwordHash && account.roles.some((r) => r.requiresPassword);
    if (!account || !eligible || !account.passwordHash) {
      await this.hasher.verifyDummy(input.password);
      throw IdentityErrors.invalidCredentials();
    }

    const now = Date.now();
    const failures = await this.challenges.failedPasswordAttemptsSince(account.userId, new Date(now - PASSWORD_LOCK_WINDOW_MS));
    if (failures.length >= PASSWORD_MAX_FAILURES) {
      const oldest = Math.min(...failures.map((d) => d.getTime()));
      throw IdentityErrors.passwordLocked(Math.max(1, Math.ceil((oldest + PASSWORD_LOCK_WINDOW_MS - now) / 1000)));
    }

    const valid = await this.hasher.verify(account.passwordHash, input.password);
    await this.challenges.recordAttempt({
      factor: AUTH_FACTORS.PASSWORD,
      userId: account.userId,
      succeeded: valid,
      ipAddress: input.ipAddress,
    });
    if (!valid) throw IdentityErrors.invalidCredentials();
    if (!account.canSignIn) throw IdentityErrors.accountDisabled();

    return this.otp.send({
      phone,
      purpose: OTP_PURPOSES.STAFF_SIGN_IN,
      channel: input.channel,
      language: account.language,
      ipAddress: input.ipAddress,
    });
  }
}
