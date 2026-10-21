import { Injectable } from '@nestjs/common';
import { NotificationTypeCode } from '../domain/notifications.codes';
import { NotificationOutbox } from '../domain/ports/notification-outbox';

/** Despierta al repartidor de la bandeja de salida. Lo implementa infrastructure/outbox-pump.ts. */
export abstract class OutboxSignal {
  abstract kick(): void;
}

/**
 * Puerta de entrada para los demás módulos. Dos formas de avisar:
 * - Cambios de estado del pedido: los genera la base de datos (fn_order_status_history_notify) en la misma
 *   transacción. Quien cambie un estado solo llama `kick()` después de confirmar para que salga al instante.
 * - Avisos que no son cambios de estado (oferta al domiciliario, ajustes): `notify()`.
 */
@Injectable()
export class Notifier {
  constructor(
    private readonly outbox: NotificationOutbox,
    private readonly signal: OutboxSignal,
  ) {}

  async notify(input: { recipientUserId: string; type: NotificationTypeCode; orderId?: string; params?: Record<string, string | number> }): Promise<string> {
    const id = await this.outbox.create(input);
    this.signal.kick();
    return id;
  }

  kick(): void {
    this.signal.kick();
  }
}
