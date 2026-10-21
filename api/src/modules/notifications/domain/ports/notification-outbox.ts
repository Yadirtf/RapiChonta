import { NotificationTypeCode } from '../notifications.codes';
import { PushTarget } from '../push-message';

/** Un aviso pendiente con lo necesario para escribir su texto. */
export interface PendingNotification {
  id: string;
  recipientUserId: string;
  type: NotificationTypeCode;
  highPriority: boolean;
  language: string;
  orderCode: string | null;
  /** En ORDER_STATUS_CHANGED, el estado nuevo. */
  status: string | null;
  storeName: string | null;
  params: Record<string, string | number> | null;
  targets: PushTarget[];
}

export interface AttemptResult {
  deliveryId: string;
  status: 'SENT' | 'FAILED';
  providerMessageId?: string;
  errorCode?: string;
}

/** Bandeja de salida: avisos guardados en la misma transacción que los origina y repartidos después. */
export abstract class NotificationOutbox {
  /**
   * Toma hasta `limit` avisos pendientes y los marca repartidos (FOR UPDATE SKIP LOCKED: varias instancias
   * no toman el mismo). Los más viejos que `maxAgeSeconds` se marcan sin enviarse: un "va en camino" de hace
   * una hora ya no sirve en el teléfono (sigue en la bandeja de avisos de la app).
   */
  abstract claim(limit: number, maxAgeSeconds: number): Promise<PendingNotification[]>;
  /** Hay pedidos en curso: el repartidor revisa seguido mientras alguien espera un pedido. */
  abstract hasActiveOrders(): Promise<boolean>;
  abstract queueAttempts(notificationId: string, tokenIds: string[]): Promise<string[]>;
  abstract finishAttempts(results: AttemptResult[]): Promise<void>;
  abstract invalidateTokens(tokenIds: string[]): Promise<void>;
  /** Crea un aviso (los que no nacen de un disparador de la base, como la oferta al domiciliario en E07). */
  abstract create(input: {
    recipientUserId: string;
    type: NotificationTypeCode;
    orderId?: string;
    params?: Record<string, string | number>;
  }): Promise<string>;
}
