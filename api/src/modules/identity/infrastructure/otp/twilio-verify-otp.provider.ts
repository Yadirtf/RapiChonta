import { Injectable, Logger } from '@nestjs/common';
import { ServiceUnavailableError } from '../../../../shared/domain/domain.error';
import { IssuedOtp, IssueOtpRequest, OtpProvider, StoredOtp } from '../../domain/ports/otp-provider.port';

export interface TwilioVerifyOptions {
  accountSid: string;
  authToken: string;
  serviceSid: string;
}

/**
 * Twilio Verify genera, envía (SMS o WhatsApp) y valida el código. En la base de datos se guarda solo el id
 * de la verificación (provider_message_id). Se usa la API REST directamente para no sumar dependencias.
 */
@Injectable()
export class TwilioVerifyOtpProvider extends OtpProvider {
  private readonly logger = new Logger(TwilioVerifyOtpProvider.name);

  constructor(private readonly options: TwilioVerifyOptions) {
    super();
  }

  async issue(request: IssueOtpRequest): Promise<IssuedOtp> {
    const body = await this.post('Verifications', {
      To: request.phone.e164,
      Channel: request.channel === 'WHATSAPP' ? 'whatsapp' : 'sms',
      Locale: request.language,
    });
    return { providerMessageId: String(body.sid) };
  }

  async verify(otp: StoredOtp, code: string): Promise<boolean> {
    const body = await this.post('VerificationCheck', { To: otp.phone.e164, Code: code });
    return body.status === 'approved';
  }

  private async post(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const url = `https://verify.twilio.com/v2/Services/${this.options.serviceSid}/${path}`;
    const auth = Buffer.from(`${this.options.accountSid}:${this.options.authToken}`).toString('base64');
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(10_000),
    }).catch((error: Error) => {
      this.logger.error(`Twilio no respondió: ${error.message}`);
      throw new ServiceUnavailableError('OTP_PROVIDER_UNAVAILABLE');
    });
    // 404 en VerificationCheck = la verificación venció o ya se aprobó: es un código inválido, no una caída.
    if (response.status === 404) return { status: 'not_found' };
    if (!response.ok) {
      this.logger.error(`Twilio respondió ${response.status} en ${path}`);
      throw new ServiceUnavailableError('OTP_PROVIDER_UNAVAILABLE');
    }
    return (await response.json()) as Record<string, unknown>;
  }
}
