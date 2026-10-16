export interface OtpSettings {
  ttlSeconds: number;
  maxAttempts: number;
  maxSendsPerHour: number;
}

/** Parámetros del negocio que usa identity (setting_values, E03). */
export abstract class IdentitySettings {
  abstract otp(): Promise<OtpSettings>;
}
