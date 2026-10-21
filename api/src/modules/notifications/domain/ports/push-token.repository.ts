import { PushProviderCode, TokenInvalidationReason } from '../notifications.codes';

export abstract class PushTokenRepository {
  /** Dispositivo de la sesión (tabla devices) o null si la sesión no vino de la app. */
  abstract deviceOfSession(sessionId: string): Promise<string | null>;
  /**
   * Deja `token` como el vigente del dispositivo para ese proveedor. Da de baja el anterior (REPLACED) y, si el
   * mismo token seguía vigente en otro dispositivo (reinstalación), también ese. Idempotente.
   */
  abstract register(deviceId: string, provider: PushProviderCode, token: string): Promise<void>;
  /** Da de baja los tokens vigentes del dispositivo (todos los proveedores). */
  abstract invalidateDevice(deviceId: string, reason: TokenInvalidationReason): Promise<void>;
}
