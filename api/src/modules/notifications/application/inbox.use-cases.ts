import { Injectable } from '@nestjs/common';
import { Principal } from '../../identity/domain/principal';
import { InboxItem, InboxRepository } from '../domain/ports/inbox.repository';

const PAGE = { default: 20, max: 50 } as const;

/** Bandeja de avisos en la app: lo que llegó por push (o no llegó, en un teléfono sin servicios) queda aquí. */
@Injectable()
export class MyNotificationsUseCase {
  constructor(private readonly inbox: InboxRepository) {}

  async list(principal: Principal, query: { before?: Date; limit?: number } = {}) {
    const limit = Math.min(PAGE.max, Math.max(1, Math.trunc(query.limit ?? PAGE.default)));
    const [rows, unread] = await Promise.all([
      this.inbox.list(principal.userId, { before: query.before, limit: limit + 1 }),
      this.inbox.unreadCount(principal.userId),
    ]);
    const items: InboxItem[] = rows.slice(0, limit);
    return { items, unread, nextBefore: rows.length > limit ? items[items.length - 1].createdAt.toISOString() : null };
  }

  async unread(principal: Principal): Promise<number> {
    return this.inbox.unreadCount(principal.userId);
  }

  /** Sin `ids`, marca todo. Devuelve cuántos quedan sin leer. */
  async markRead(principal: Principal, ids?: string[]): Promise<number> {
    await this.inbox.markRead(principal.userId, ids);
    return this.inbox.unreadCount(principal.userId);
  }
}
