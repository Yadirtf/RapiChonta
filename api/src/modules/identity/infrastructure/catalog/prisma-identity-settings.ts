import { Injectable } from '@nestjs/common';
import { SettingsReader } from '../../../../shared/infrastructure/settings/settings.reader';
import { IdentitySettings, OtpSettings } from '../../domain/ports/identity-settings.port';

/** Valores por defecto = los de la semilla (H01.1): solo se usan si falta el parámetro. */
@Injectable()
export class PrismaIdentitySettings extends IdentitySettings {
  constructor(private readonly settings: SettingsReader) {
    super();
  }

  async otp(): Promise<OtpSettings> {
    const [ttlSeconds, maxAttempts, maxSendsPerHour] = await Promise.all([
      this.settings.number('otp.ttl_seconds', 300),
      this.settings.number('otp.max_attempts', 5),
      this.settings.number('otp.max_sends_per_hour', 3),
    ]);
    return { ttlSeconds, maxAttempts, maxSendsPerHour };
  }
}
