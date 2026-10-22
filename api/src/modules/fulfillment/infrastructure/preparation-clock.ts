import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Notifier } from '../../notifications/application/notifier';
import { PreparationSignal } from '../application/preparation-signal';
import { DeliveryReviewWatch, PreparationWatch } from '../domain/ports/courier-trips';

export interface PreparationClockOptions {
  /** Revisión de respaldo sin pedidos en preparación (ms): larga para que la base (Neon) pueda dormir. */
  idleMs: number;
  /** Nunca más seguido que esto (ms). */
  minMs: number;
}

/** Cuánto dormir: hasta la próxima revisión pendiente, o la de respaldo si no hay. */
export function nextPreparationDelay(next: Date | null, now: Date, options: PreparationClockOptions): number {
  if (!next) return options.idleMs;
  return Math.min(options.idleMs, Math.max(options.minMs, next.getTime() - now.getTime()));
}

/** La más próxima de dos horas (cualquiera puede faltar). */
const earliest = (a: Date | null, b: Date | null) => (a && b ? (a < b ? a : b) : (a ?? b));

/**
 * Reloj del pedido en curso, como el del despacho: duerme hasta la próxima hora de "ya debería estar listo"
 * (H08.5, encola el aviso al domiciliario) o hasta que vence la revisión de una entrega con foto (la cierra como
 * entregada). Cualquier paso del domiciliario lo despierta.
 */
@Injectable()
export class PreparationClock extends PreparationSignal implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PreparationClock.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private again = false;
  private stopped = false;

  constructor(
    private readonly watch: PreparationWatch,
    private readonly notifier: Notifier,
    private readonly options: PreparationClockOptions,
    private readonly review?: DeliveryReviewWatch,
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

  reschedule(): void {
    if (this.running) this.again = true;
    else this.schedule(0);
  }

  /** Una pasada (pública para las pruebas): avisa lo vencido y programa la próxima. */
  async run(now = () => new Date()): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        const queued = await this.watch.notifyDue();
        const closed = this.review ? await this.review.closeDue() : 0;
        if (queued || closed) this.notifier.kick();
      } while (this.again);
      const next = earliest(await this.watch.nextCheckAt(), this.review ? await this.review.nextDueAt() : null);
      this.schedule(nextPreparationDelay(next, now(), this.options));
    } catch (error) {
      this.logger.error(`Reloj del pedido en curso: ${(error as Error).message}`);
      this.schedule(this.options.minMs * 10);
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
