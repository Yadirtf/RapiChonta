import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { NotificationTypeCode } from '../../domain/notifications.codes';
import { InboxItem, InboxRepository } from '../../domain/ports/inbox.repository';

@Injectable()
export class PrismaInboxRepository extends InboxRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(userId: string, query: { before?: Date; limit: number }): Promise<InboxItem[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; type: NotificationTypeCode; order_code: string | null; status: string | null; store_name: string | null; params: InboxItem['params']; created_at: Date; read_at: Date | null }[]
    >`
      SELECT n.id, t.code AS type, o.code AS order_code, s.code AS status, e.name AS store_name, n.params, n.created_at, n.read_at
      FROM notifications n
      JOIN notification_types t ON t.id = n.notification_type_id
      LEFT JOIN orders o ON o.id = n.order_id
      LEFT JOIN establishments e ON e.id = o.establishment_id
      LEFT JOIN order_status_history h ON h.id = n.order_status_history_id
      LEFT JOIN order_statuses s ON s.id = h.to_status_id
      WHERE n.recipient_user_id = ${userId}::uuid ${query.before ? Prisma.sql`AND n.created_at < ${query.before}` : Prisma.empty}
      ORDER BY n.created_at DESC
      LIMIT ${query.limit}`;
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      orderCode: r.order_code,
      status: r.status,
      storeName: r.store_name,
      params: r.params,
      createdAt: r.created_at,
      readAt: r.read_at,
    }));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { recipientUserId: userId, readAt: null } });
  }

  async markRead(userId: string, ids?: string[]): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
  }
}
