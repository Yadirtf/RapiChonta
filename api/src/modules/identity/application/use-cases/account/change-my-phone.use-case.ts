import { Injectable } from '@nestjs/common';
import { OTP_PURPOSES, OtpChannelCode } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { Principal } from '../../../domain/principal';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { OtpService, SentOtp } from '../../services/otp.service';

/** H01.5: cambiar el celular exige un código enviado al número nuevo (PHONE_CHANGE). */
@Injectable()
export class ChangeMyPhoneUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly otp: OtpService,
  ) {}

  async requestCode(principal: Principal, input: { phone: string; channel: OtpChannelCode; ipAddress?: string }): Promise<SentOtp> {
    const phone = PhoneNumber.parse(input.phone);
    const account = await this.accounts.findById(principal.userId);
    if (!account) throw IdentityErrors.userNotFound();
    if (account.phone?.equals(phone)) throw IdentityErrors.samePhone();
    if (await this.accounts.findByPhone(phone)) throw IdentityErrors.phoneAlreadyRegistered();
    return this.otp.send({
      phone,
      purpose: OTP_PURPOSES.PHONE_CHANGE,
      channel: input.channel,
      language: account.language,
      ipAddress: input.ipAddress,
    });
  }

  async confirm(principal: Principal, input: { challengeId: string; code: string; ipAddress?: string }): Promise<string> {
    const phone = await this.otp.verify({ ...input, purpose: OTP_PURPOSES.PHONE_CHANGE });
    if (await this.accounts.findByPhone(phone)) throw IdentityErrors.phoneAlreadyRegistered();
    await this.accounts.replacePrimaryPhone(principal.userId, phone);
    return phone.e164;
  }
}
