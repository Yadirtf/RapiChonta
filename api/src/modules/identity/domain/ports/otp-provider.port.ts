import { OtpChannelCode } from '../identity.codes';
import { PhoneNumber } from '../value-objects/phone-number';

export interface IssueOtpRequest {
  challengeId: string;
  phone: PhoneNumber;
  channel: OtpChannelCode;
  language: string;
}

export interface IssuedOtp {
  /** Hash del código cuando lo genera la API. */
  codeHash?: string;
  /** Id de la verificación cuando el proveedor genera y valida el código (Twilio Verify). */
  providerMessageId?: string;
  /** Solo con OTP_EXPOSE_CODE=true en entornos de prueba sin proveedor de SMS. */
  exposedCode?: string;
}

export interface StoredOtp {
  challengeId: string;
  phone: PhoneNumber;
  codeHash: string | null;
  providerMessageId: string | null;
}

/** Puerto del proveedor de códigos (H01.1, nota: "proveedor de SMS detrás de un puerto"). */
export abstract class OtpProvider {
  abstract issue(request: IssueOtpRequest): Promise<IssuedOtp>;
  abstract verify(otp: StoredOtp, code: string): Promise<boolean>;
}
