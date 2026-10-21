import { Logger } from '@nestjs/common';
import { composePush, PushTexts } from '../domain/compose-push';
import { AttemptResult, NotificationOutbox, PendingNotification } from '../domain/ports/notification-outbox';
import { PushGateways } from '../domain/ports/push-gateway';
import { PushMessage, PushTarget } from '../domain/push-message';

export interface DispatchOptions {
  /** Avisos por vuelta. */
  batchSize: number;
  /** Un aviso más viejo que esto ya no se envía al teléfono (queda en la bandeja de la app). */
  maxAgeSeconds: number;
  /** Intentos por token ante fallas pasajeras del proveedor (cada intento es una fila). */
  maxAttempts: number;
  /** Espera antes del reintento n (ms): backoff[n-1]. */
  backoffMs: number[];
}

export const DEFAULT_DISPATCH_OPTIONS: DispatchOptions = { batchSize: 50, maxAgeSeconds: 1800, maxAttempts: 3, backoffMs: [1_000, 4_000] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reparte la bandeja de salida (H06.1): cada aviso pendiente se escribe en el idioma del destinatario y se envía
 * a los tokens vigentes de los dispositivos donde tiene sesión abierta, por el proveedor de cada token.
 * Cada intento queda en notification_deliveries; los tokens que el proveedor rechaza se dan de baja.
 * Se arma en el módulo (useFactory) porque recibe las plantillas y las opciones, no solo puertos.
 */
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    private readonly outbox: NotificationOutbox,
    private readonly gateways: PushGateways,
    private readonly texts: PushTexts,
    private readonly options: DispatchOptions = DEFAULT_DISPATCH_OPTIONS,
    private readonly wait: (ms: number) => Promise<unknown> = sleep,
  ) {}

  /** Una vuelta: devuelve cuántos avisos tomó (si llenó el lote, conviene otra vuelta enseguida). */
  async drainOnce(): Promise<number> {
    const pending = await this.outbox.claim(this.options.batchSize, this.options.maxAgeSeconds);
    await Promise.all(pending.map((notification) => this.deliver(notification)));
    return pending.length;
  }

  private async deliver(notification: PendingNotification): Promise<void> {
    const message = composePush(notification, this.texts);
    if (!message || notification.targets.length === 0) return;
    const byProvider = new Map<string, PushTarget[]>();
    for (const target of notification.targets) {
      if (!this.gateways.for(target.provider)) continue;
      byProvider.set(target.provider, [...(byProvider.get(target.provider) ?? []), target]);
    }
    await Promise.all([...byProvider.values()].map((targets) => this.sendWithRetries(notification.id, message, targets)));
  }

  private async sendWithRetries(notificationId: string, message: PushMessage, targets: PushTarget[]): Promise<void> {
    const gateway = this.gateways.for(targets[0].provider)!;
    let remaining = targets;
    for (let attempt = 1; remaining.length > 0 && attempt <= this.options.maxAttempts; attempt++) {
      if (attempt > 1) await this.wait(this.options.backoffMs[attempt - 2] ?? this.options.backoffMs.at(-1) ?? 0);
      const deliveryIds = await this.outbox.queueAttempts(notificationId, remaining.map((t) => t.tokenId));
      let outcomes;
      try {
        outcomes = await gateway.send(message, remaining.map((t) => t.token));
      } catch (error) {
        this.logger.warn(`${gateway.provider} no respondió: ${(error as Error).message}`);
        outcomes = remaining.map(() => ({ kind: 'failed' as const, errorCode: 'PROVIDER_UNREACHABLE', retryable: true }));
      }
      const results: AttemptResult[] = [];
      const invalid: string[] = [];
      const retry: PushTarget[] = [];
      outcomes.forEach((outcome, index) => {
        const deliveryId = deliveryIds[index];
        if (outcome.kind === 'sent') {
          results.push({ deliveryId, status: 'SENT', providerMessageId: outcome.providerMessageId });
          return;
        }
        results.push({ deliveryId, status: 'FAILED', errorCode: outcome.errorCode });
        if (outcome.kind === 'invalidToken') invalid.push(remaining[index].tokenId);
        else if (outcome.retryable) retry.push(remaining[index]);
      });
      await this.outbox.finishAttempts(results);
      if (invalid.length) await this.outbox.invalidateTokens(invalid);
      remaining = retry;
    }
  }
}
