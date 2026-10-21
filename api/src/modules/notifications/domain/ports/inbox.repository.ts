import { NotificationTypeCode } from '../notifications.codes';

export interface InboxItem {
  id: string;
  type: NotificationTypeCode;
  orderCode: string | null;
  status: string | null;
  storeName: string | null;
  params: Record<string, string | number> | null;
  createdAt: Date;
  readAt: Date | null;
}

/** Bandeja de avisos del usuario (en la app), con o sin push. */
export abstract class InboxRepository {
  abstract list(userId: string, query: { before?: Date; limit: number }): Promise<InboxItem[]>;
  abstract unreadCount(userId: string): Promise<number>;
  /** Marca leídos los avisos indicados (o todos si `ids` es undefined). Ignora los que no son del usuario. */
  abstract markRead(userId: string, ids?: string[]): Promise<void>;
}
