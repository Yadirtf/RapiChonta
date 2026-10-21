import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Notifier } from '../../notifications/application/notifier';
import { PreparationSignal } from '../application/preparation-signal';
import { PreparationWatch } from '../domain/ports/courier-trips';

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

/**
 * Reloj de la preparación (H08.5), como el del despacho: duerme hasta la próxima hora de "ya debería estar
 * listo" y encola el aviso al domiciliario. Una compra nueva o "Sigue en preparación" lo despiertan.
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
        if (queued) this.notifier.kick();
      } while (this.again);
      this.schedule(nextPreparationDelay(await this.watch.nextCheckAt(), now(), this.options));
    } catch (error) {
      this.logger.error(`Reloj de preparación: ${(error as Error).message}`);
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
