import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { IssuedOtp, IssueOtpRequest, OtpProvider, StoredOtp } from '../../domain/ports/otp-provider.port';

export interface OtpProviderOptions {
  /** Secreto para el HMAC del código (JWT_SECRET si no se define OTP_PEPPER). */
  pepper: string;
  /** Devuelve el código en la respuesta: solo para pruebas sin proveedor de SMS. */
  exposeCode: boolean;
}

/**
 * La API genera el código de 6 dígitos y guarda HMAC-SHA256(secreto, challengeId:código).
 * Sin proveedor de SMS configurado, el código se escribe en el log del servidor (desarrollo y pruebas).
 */
@Injectable()
export class LocalOtpProvider extends OtpProvider {
  private readonly logger = new Logger('OTP');

  constructor(private readonly options: OtpProviderOptions) {
    super();
  }

  async issue(request: IssueOtpRequest): Promise<IssuedOtp> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    this.logger.log(`Código para ${request.phone.masked} por ${request.channel}: ${code}`);
    return {
      codeHash: this.digest(request.challengeId, code),
      ...(this.options.exposeCode ? { exposedCode: code } : {}),
    };
  }

  async verify(otp: StoredOtp, code: string): Promise<boolean> {
    if (!otp.codeHash) return false;
    const expected = Buffer.from(otp.codeHash, 'hex');
    const actual = Buffer.from(this.digest(otp.challengeId, code), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private digest(challengeId: string, code: string): string {
    return createHmac('sha256', this.options.pepper).update(`${challengeId}:${code}`).digest('hex');
  }
}
