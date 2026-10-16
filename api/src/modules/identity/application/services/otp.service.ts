import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AUTH_FACTORS, OtpChannelCode, OtpPurposeCode } from '../../domain/identity.codes';
import { IdentityErrors } from '../../domain/identity.errors';
import { IdentitySettings } from '../../domain/ports/identity-settings.port';
import { OtpChallengeRepository } from '../../domain/ports/otp-challenge.repository';
import { OtpProvider } from '../../domain/ports/otp-provider.port';
import { PhoneNumber } from '../../domain/value-objects/phone-number';

export interface OtpRequest {
  phone: PhoneNumber;
  purpose: OtpPurposeCode;
  channel: OtpChannelCode;
  language: string;
  ipAddress?: string;
}

export interface SentOtp {
  challengeId: string;
  expiresAt: Date;
  channel: OtpChannelCode;
  maskedPhone: string;
  /** Solo en pruebas sin proveedor (OTP_EXPOSE_CODE=true). */
  devCode?: string;
}

const HOUR_MS = 3_600_000;

/**
 * Envío y validación de códigos (H01.1): 6 dígitos, vence a los 5 min, 5 intentos, 3 envíos por hora.
 * Los límites salen de los parámetros del negocio y se cuentan en la base de datos (no hay contadores).
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly challenges: OtpChallengeRepository,
    private readonly provider: OtpProvider,
    private readonly settings: IdentitySettings,
  ) {}

  async send(request: OtpRequest): Promise<SentOtp> {
    const settings = await this.settings.otp();
    const now = Date.now();
    const recent = await this.challenges.sentSince(request.phone, new Date(now - HOUR_MS));
    if (recent.length >= settings.maxSendsPerHour) {
      const oldest = Math.min(...recent.map((d) => d.getTime()));
      throw IdentityErrors.otpSendLimit(Math.max(1, Math.ceil((oldest + HOUR_MS - now) / 1000)));
    }

    const challengeId = randomUUID();
    const issued = await this.provider.issue({
      challengeId,
      phone: request.phone,
      channel: request.channel,
      language: request.language,
    });
    const expiresAt = new Date(now + settings.ttlSeconds * 1000);
    await this.challenges.create({
      id: challengeId,
      phone: request.phone,
      purpose: request.purpose,
      channel: request.channel,
      codeHash: issued.codeHash,
      providerMessageId: issued.providerMessageId,
      expiresAt,
      ipAddress: request.ipAddress,
    });

    return {
      challengeId,
      expiresAt,
      channel: request.channel,
      maskedPhone: request.phone.masked,
      ...(issued.exposedCode ? { devCode: issued.exposedCode } : {}),
    };
  }

  /** Valida el código y lo consume. Devuelve el número al que se envió. */
  async verify(input: { challengeId: string; code: string; purpose: OtpPurposeCode; ipAddress?: string }): Promise<PhoneNumber> {
    const challenge = await this.challenges.findById(input.challengeId);
    if (!challenge || challenge.purpose !== input.purpose) throw IdentityErrors.otpNotFound();
    if (challenge.consumedAt) throw IdentityErrors.otpNotFound();
    if (challenge.expiresAt.getTime() <= Date.now()) throw IdentityErrors.otpExpired();

    const { maxAttempts } = await this.settings.otp();
    const failed = await this.challenges.countFailedAttempts(challenge.id);
    if (failed >= maxAttempts) throw IdentityErrors.otpLocked();

    const valid = /^\d{6}$/.test(input.code) && (await this.provider.verify({
      challengeId: challenge.id,
      phone: challenge.phone,
      codeHash: challenge.codeHash,
      providerMessageId: challenge.providerMessageId,
    }, input.code));

    await this.challenges.recordAttempt({
      factor: AUTH_FACTORS.OTP,
      otpChallengeId: challenge.id,
      succeeded: valid,
      ipAddress: input.ipAddress,
    });

    if (!valid) {
      const remaining = maxAttempts - failed - 1;
      throw remaining > 0 ? IdentityErrors.otpInvalid(remaining) : IdentityErrors.otpLocked();
    }
    if (!(await this.challenges.consume(challenge.id))) throw IdentityErrors.otpNotFound();
    return challenge.phone;
  }
}
