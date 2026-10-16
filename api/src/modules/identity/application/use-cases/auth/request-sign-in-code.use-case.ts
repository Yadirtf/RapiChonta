import { Injectable } from '@nestjs/common';
import { OTP_PURPOSES, OtpChannelCode } from '../../../domain/identity.codes';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { OtpService, SentOtp } from '../../services/otp.service';

/** H01.1: el cliente escribe su celular y recibe un código. No revela si el número ya tiene cuenta. */
@Injectable()
export class RequestSignInCodeUseCase {
  constructor(private readonly otp: OtpService) {}

  execute(input: { phone: string; channel: OtpChannelCode; language: string; ipAddress?: string }): Promise<SentOtp> {
    return this.otp.send({
      phone: PhoneNumber.parse(input.phone),
      purpose: OTP_PURPOSES.SIGN_IN,
      channel: input.channel,
      language: input.language,
      ipAddress: input.ipAddress,
    });
  }
}
