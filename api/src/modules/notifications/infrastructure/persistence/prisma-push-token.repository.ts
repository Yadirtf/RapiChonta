import { Injectable } from '@nestjs/common';
import { CatalogIds } from '../../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { PushProviderCode, TOKEN_INVALIDATION_REASONS, TokenInvalidationReason } from '../../domain/notifications.codes';
import { PushTokenRepository } from '../../domain/ports/push-token.repository';

@Injectable()
export class PrismaPushTokenRepository extends PushTokenRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async deviceOfSession(sessionId: string): Promise<string | null> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { deviceId: true } });
    return session?.deviceId ?? null;
  }

  async register(deviceId: string, provider: PushProviderCode, token: string): Promise<void> {
    const providerId = await this.ids.of('push_providers', provider);
    const replaced = await this.ids.of('push_token_invalidation_reasons', TOKEN_INVALIDATION_REASONS.REPLACED);
    await this.prisma.$transaction(async (tx) => {
      // El dispositivo serializa los registros concurrentes (la app puede mandar el mismo token dos veces al abrir).
      await tx.$queryRaw`SELECT id FROM devices WHERE id = ${deviceId}::uuid FOR UPDATE`;
      const current = await tx.devicePushToken.findFirst({
        where: { deviceId, pushProviderId: providerId, invalidatedAt: null },
        select: { token: true },
      });
      if (current?.token === token) return;
      // Baja del anterior de este dispositivo y del mismo token si seguía vigente en otro (reinstalación).
      await tx.$executeRaw`
        UPDATE device_push_tokens SET invalidated_at = now(), invalidation_reason_id = ${replaced}
        WHERE invalidated_at IS NULL AND ((device_id = ${deviceId}::uuid AND push_provider_id = ${providerId}) OR token = ${token})`;
      await tx.devicePushToken.create({ data: { deviceId, pushProviderId: providerId, token } });
      await tx.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });
    });
  }

  async invalidateDevice(deviceId: string, reason: TokenInvalidationReason): Promise<void> {
    const reasonId = await this.ids.of('push_token_invalidation_reasons', reason);
    await this.prisma.$executeRaw`
      UPDATE device_push_tokens SET invalidated_at = now(), invalidation_reason_id = ${reasonId}
      WHERE device_id = ${deviceId}::uuid AND invalidated_at IS NULL`;
  }
}
