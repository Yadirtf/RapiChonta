import { AuthFactorCode, OtpChannelCode, OtpPurposeCode } from '../identity.codes';
import { PhoneNumber } from '../value-objects/phone-number';

export interface OtpChallenge {
  id: string;
  phone: PhoneNumber;
  purpose: OtpPurposeCode;
  channel: OtpChannelCode;
  codeHash: string | null;
  providerMessageId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface NewOtpChallenge {
  id: string;
  phone: PhoneNumber;
  purpose: OtpPurposeCode;
  channel: OtpChannelCode;
  codeHash?: string;
  providerMessageId?: string;
  expiresAt: Date;
  ipAddress?: string;
}

export interface NewAuthAttempt {
  factor: AuthFactorCode;
  otpChallengeId?: string;
  userId?: string;
  succeeded: boolean;
  ipAddress?: string;
}

export abstract class OtpChallengeRepository {
  abstract create(challenge: NewOtpChallenge): Promise<void>;
  abstract findById(id: string): Promise<OtpChallenge | null>;
  /** Fechas de los códigos enviados a un número desde `since` (para el límite por hora). */
  abstract sentSince(phone: PhoneNumber, since: Date): Promise<Date[]>;
  abstract countFailedAttempts(challengeId: string): Promise<number>;
  /** Fechas de los intentos fallidos de contraseña de un usuario desde `since`. */
  abstract failedPasswordAttemptsSince(userId: string, since: Date): Promise<Date[]>;
  abstract recordAttempt(attempt: NewAuthAttempt): Promise<void>;
  /** Marca el código como usado. Devuelve false si otro uso llegó primero. */
  abstract consume(challengeId: string): Promise<boolean>;
}
