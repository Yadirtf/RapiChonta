import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogIds } from '../../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { DELIVERY_STATUSES, NotificationTypeCode, PushProviderCode, TOKEN_INVALIDATION_REASONS } from '../../domain/notifications.codes';
import { AttemptResult, NotificationOutbox, PendingNotification } from '../../domain/ports/notification-outbox';

interface ClaimedRow {
  id: string;
  recipient_user_id: string;
  type: NotificationTypeCode;
  high_priority: boolean;
  language: string | null;
  order_code: string | null;
  status: string | null;
  store_name: string | null;
  params: Record<string, string | number> | null;
}

@Injectable()
export class PrismaNotificationOutbox extends NotificationOutbox {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async claim(limit: number, maxAgeSeconds: number): Promise<PendingNotification[]> {
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      WITH expired AS (
        UPDATE notifications SET dispatched_at = clock_timestamp()
        WHERE id IN (SELECT id FROM notifications
                     WHERE dispatched_at IS NULL AND created_at < now() - make_interval(secs => ${maxAgeSeconds})
                     FOR UPDATE SKIP LOCKED)
      ), claimed AS (
        UPDATE notifications SET dispatched_at = clock_timestamp()
        WHERE id IN (SELECT id FROM notifications
                     WHERE dispatched_at IS NULL AND created_at >= now() - make_interval(secs => ${maxAgeSeconds})
                     ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
        RETURNING id, recipient_user_id, notification_type_id, order_id, order_status_history_id, params
      )
      SELECT c.id, c.recipient_user_id, t.code AS type, t.is_high_priority AS high_priority, l.code AS language,
             o.code AS order_code, s.code AS status, e.name AS store_name, c.params
      FROM claimed c
      JOIN notification_types t ON t.id = c.notification_type_id
      LEFT JOIN user_preferences up ON up.user_id = c.recipient_user_id
      LEFT JOIN languages l ON l.id = up.language_id
      LEFT JOIN orders o ON o.id = c.order_id
      LEFT JOIN establishments e ON e.id = o.establishment_id
      LEFT JOIN order_status_history h ON h.id = c.order_status_history_id
      LEFT JOIN order_statuses s ON s.id = h.to_status_id`;
    if (!rows.length) return [];

    // Destinos: tokens vigentes de los dispositivos con una sesión abierta y viva del destinatario (no se guarda el vínculo).
    const recipients = [...new Set(rows.map((r) => r.recipient_user_id))];
    const targets = await this.prisma.$queryRaw<{ user_id: string; token_id: string; token: string; provider: PushProviderCode }[]>`
      SELECT DISTINCT s.user_id, t.id AS token_id, t.token, p.code AS provider
      FROM sessions s
      JOIN device_push_tokens t ON t.device_id = s.device_id AND t.invalidated_at IS NULL
      JOIN push_providers p ON p.id = t.push_provider_id AND p.deactivated_at IS NULL
      WHERE s.user_id = ANY(${recipients}::uuid[]) AND s.ended_at IS NULL
        AND EXISTS (SELECT 1 FROM refresh_tokens rt WHERE rt.session_id = s.id AND rt.consumed_at IS NULL AND rt.expires_at > now())`;

    return rows.map((row) => ({
      id: row.id,
      recipientUserId: row.recipient_user_id,
      type: row.type,
      highPriority: row.high_priority,
      language: row.language ?? 'es',
      orderCode: row.order_code,
      status: row.status,
      storeName: row.store_name,
      params: row.params,
      targets: targets
        .filter((t) => t.user_id === row.recipient_user_id)
        .map((t) => ({ tokenId: t.token_id, token: t.token, provider: t.provider })),
    }));
  }

  async hasActiveOrders(): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ active: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM orders o JOIN order_statuses s ON s.id = o.status_id AND NOT s.is_terminal
                     WHERE o.created_at > now() - interval '1 day') AS active`;
    return row.active;
  }

  async queueAttempts(notificationId: string, tokenIds: string[]): Promise<string[]> {
    const queued = await this.ids.of('notification_delivery_statuses', DELIVERY_STATUSES.QUEUED);
    const rows = await this.prisma.$queryRaw<{ id: string; token_id: string }[]>`
      INSERT INTO notification_deliveries (notification_id, device_push_token_id, status_id)
      SELECT ${notificationId}::uuid, token_id, ${queued} FROM unnest(${tokenIds}::uuid[]) AS x(token_id)
      RETURNING id, device_push_token_id AS token_id`;
    // Un intento por token: se devuelven en el orden de `tokenIds`.
    const byToken = new Map(rows.map((r) => [r.token_id, r.id]));
    return tokenIds.map((tokenId) => byToken.get(tokenId)!);
  }

  async finishAttempts(results: AttemptResult[]): Promise<void> {
    if (!results.length) return;
    const [sent, failed] = await Promise.all([
      this.ids.of('notification_delivery_statuses', DELIVERY_STATUSES.SENT),
      this.ids.of('notification_delivery_statuses', DELIVERY_STATUSES.FAILED),
    ]);
    const values = results.map(
      (r) => Prisma.sql`(${r.deliveryId}::uuid, ${r.status === 'SENT' ? sent : failed}::smallint, ${r.providerMessageId ?? null}::varchar, ${r.errorCode ?? null}::varchar)`,
    );
    await this.prisma.$executeRaw`
      UPDATE notification_deliveries d
      SET status_id = v.status_id, provider_message_id = left(v.message_id, 200), error_code = left(v.error_code, 80)
      FROM (VALUES ${Prisma.join(values)}) AS v(id, status_id, message_id, error_code)
      WHERE d.id = v.id`;
  }

  async invalidateTokens(tokenIds: string[]): Promise<void> {
    const reason = await this.ids.of('push_token_invalidation_reasons', TOKEN_INVALIDATION_REASONS.REJECTED_BY_PROVIDER);
    await this.prisma.$executeRaw`
      UPDATE device_push_tokens SET invalidated_at = now(), invalidation_reason_id = ${reason}
      WHERE id = ANY(${tokenIds}::uuid[]) AND invalidated_at IS NULL`;
  }

  async create(input: { recipientUserId: string; type: NotificationTypeCode; orderId?: string; params?: Record<string, string | number> }): Promise<string> {
    const typeId = await this.ids.of('notification_types', input.type);
    const created = await this.prisma.notification.create({
      data: {
        recipientUserId: input.recipientUserId,
        notificationTypeId: typeId,
        orderId: input.orderId ?? null,
        params: input.params ?? Prisma.DbNull,
      },
      select: { id: true },
    });
    return created.id;
  }
}
