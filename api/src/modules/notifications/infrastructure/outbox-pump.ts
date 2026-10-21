import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { NotificationDispatcher } from '../application/notification-dispatcher';
import { OutboxSignal } from '../application/notifier';
import { NotificationOutbox } from '../domain/ports/notification-outbox';

export interface PumpOptions {
  /** Revisión mientras hay pedidos en curso o acaba de salir algo (ms). */
  activeMs: number;
  /** Revisión de respaldo sin pedidos en curso (ms): larga para que la base (Neon) pueda dormir. */
  idleMs: number;
  batchSize: number;
}

/**
 * Mueve la bandeja de salida. Sale al instante cuando alguien llama `kick()` (tras un cambio de estado o un
 * aviso nuevo) y, de respaldo, revisa sola: seguido mientras hay pedidos en curso (la app del cliente ya está
 * consultando, la base está despierta) y muy de vez en cuando si no, para no mantener la base encendida.
 * Varias instancias pueden correrlo a la vez: cada aviso lo toma una sola (SKIP LOCKED).
 */
@Injectable()
export class OutboxPump extends OutboxSignal implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxPump.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private again = false;
  private stopped = false;

  constructor(
    private readonly dispatcher: NotificationDispatcher,
    private readonly outbox: NotificationOutbox,
    private readonly options: PumpOptions,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    if (!process.env.DATABASE_URL) return;
    this.schedule(5_000);
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  kick(): void {
    if (this.running) this.again = true;
    else this.schedule(0);
  }

  /** Una pasada completa (público para las pruebas): reparte todo lo pendiente y decide cuándo volver. */
  async run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    let delivered = 0;
    try {
      do {
        this.again = false;
        let claimed: number;
        do {
          claimed = await this.dispatcher.drainOnce();
          delivered += claimed;
        } while (claimed >= this.options.batchSize);
      } while (this.again);
      const active = delivered > 0 || (await this.outbox.hasActiveOrders());
      this.schedule(active ? this.options.activeMs : this.options.idleMs);
    } catch (error) {
      this.logger.error(`Bandeja de salida: ${(error as Error).message}`);
      this.schedule(this.options.activeMs * 6);
    } finally {
      this.running = false;
    }
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
    this.timer.unref?.();
  }
}
