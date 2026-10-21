import { randomUUID } from 'node:crypto';
import { NotificationTypeCode, PushProviderCode, TokenInvalidationReason } from '../../src/modules/notifications/domain/notifications.codes';
import { AttemptResult, NotificationOutbox, PendingNotification } from '../../src/modules/notifications/domain/ports/notification-outbox';
import { PushTokenRepository } from '../../src/modules/notifications/domain/ports/push-token.repository';

/** Dobles en memoria de los puertos de notificaciones: el reparto se prueba sin base de datos. */

export const pending = (overrides: Partial<PendingNotification> = {}): PendingNotification => ({
  id: randomUUID(),
  recipientUserId: 'cliente-1',
  type: 'ORDER_STATUS_CHANGED',
  highPriority: true,
  language: 'es',
  orderCode: 'RC-7K3M',
  status: 'ON_THE_WAY',
  storeName: 'Asadero La Chonta',
  params: null,
  targets: [],
  ...overrides,
});

export const target = (token: string, provider: PushProviderCode = 'FCM') => ({ tokenId: `id-${token}`, token, provider });

export class MemoryOutbox extends NotificationOutbox {
  queue: PendingNotification[] = [];
  attempts: { id: string; notificationId: string; tokenId: string; status: 'QUEUED' | 'SENT' | 'FAILED'; errorCode?: string }[] = [];
  invalidated: string[] = [];
  active = false;

  async claim(limit: number): Promise<PendingNotification[]> {
    return this.queue.splice(0, limit);
  }

  async hasActiveOrders(): Promise<boolean> {
    return this.active;
  }

  async queueAttempts(notificationId: string, tokenIds: string[]): Promise<string[]> {
    return tokenIds.map((tokenId) => {
      const id = randomUUID();
      this.attempts.push({ id, notificationId, tokenId, status: 'QUEUED' });
      return id;
    });
  }

  async finishAttempts(results: AttemptResult[]): Promise<void> {
    for (const result of results) Object.assign(this.attempts.find((a) => a.id === result.deliveryId)!, { status: result.status, errorCode: result.errorCode });
  }

  async invalidateTokens(tokenIds: string[]): Promise<void> {
    this.invalidated.push(...tokenIds);
  }

  async create(input: { recipientUserId: string; type: NotificationTypeCode }): Promise<string> {
    const notification = pending({ recipientUserId: input.recipientUserId, type: input.type, orderCode: null, status: null });
    this.queue.push(notification);
    return notification.id;
  }
}

export class MemoryPushTokens extends PushTokenRepository {
  devices = new Map<string, string | null>();
  tokens: { deviceId: string; provider: PushProviderCode; token: string; invalidated?: TokenInvalidationReason }[] = [];

  async deviceOfSession(sessionId: string): Promise<string | null> {
    return this.devices.get(sessionId) ?? null;
  }

  async register(deviceId: string, provider: PushProviderCode, token: string): Promise<void> {
    this.tokens.filter((t) => !t.invalidated && t.deviceId === deviceId && t.provider === provider).forEach((t) => (t.invalidated = 'REPLACED'));
    this.tokens.push({ deviceId, provider, token });
  }

  async invalidateDevice(deviceId: string, reason: TokenInvalidationReason): Promise<void> {
    this.tokens.filter((t) => !t.invalidated && t.deviceId === deviceId).forEach((t) => (t.invalidated = reason));
  }
}
