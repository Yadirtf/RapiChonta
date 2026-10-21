import { Injectable } from '@nestjs/common';
import { Principal } from '../../identity/domain/principal';
import { PushProviderCode, TOKEN_INVALIDATION_REASONS } from '../domain/notifications.codes';
import { NotificationErrors } from '../domain/notifications.errors';
import { PushTokenRepository } from '../domain/ports/push-token.repository';

/**
 * H06.1: la app registra el token push de su dispositivo al iniciar sesión y cada vez que el proveedor lo rota.
 * El token es del dispositivo, no del usuario: a quién le llega se decide por las sesiones abiertas en él.
 */
@Injectable()
export class RegisterPushTokenUseCase {
  constructor(private readonly tokens: PushTokenRepository) {}

  async execute(principal: Principal, input: { provider: PushProviderCode; token: string }): Promise<void> {
    const deviceId = await this.tokens.deviceOfSession(principal.sessionId);
    if (!deviceId) throw NotificationErrors.deviceRequired();
    await this.tokens.register(deviceId, input.provider, input.token.trim());
  }
}

/** H06.1: al cerrar sesión la app borra su token; el dispositivo deja de recibir avisos de inmediato. */
@Injectable()
export class RemovePushTokenUseCase {
  constructor(private readonly tokens: PushTokenRepository) {}

  async execute(principal: Principal): Promise<void> {
    const deviceId = await this.tokens.deviceOfSession(principal.sessionId);
    if (deviceId) await this.tokens.invalidateDevice(deviceId, TOKEN_INVALIDATION_REASONS.SIGNED_OUT);
  }
}
