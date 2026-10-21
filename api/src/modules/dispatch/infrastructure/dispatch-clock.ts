import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DispatchSignal } from '../application/dispatch-signal';
import { AVAILABILITY_IDLE_MINUTES } from '../domain/dispatch.codes';
import { nextSweepDelay } from '../domain/offer-plan';
import { DispatchMaintenance } from '../domain/ports/dispatch-maintenance';

export interface ClockOptions {
  /** Revisión de respaldo sin ofertas vivas (ms): larga para que la base (Neon) pueda dormir. */
  idleMs: number;
  /** Margen después del vencimiento (ms). */
  graceMs: number;
  /** Nunca más seguido que esto (ms). */
  minMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reloj del despacho. En lugar de revisar cada segundo, duerme hasta justo después de la próxima oferta por
 * vencer; un envío nuevo lo despierta (`reschedule`). En cada pasada cierra los turnos abandonados y una vez al día
 * borra las ubicaciones viejas (RNF-06).
 */
@Injectable()
export class DispatchClock extends DispatchSignal implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DispatchClock.name);
  private timer?: NodeJS.Timeout;
  private purgeTimer?: NodeJS.Timeout;
  private running = false;
  private again = false;
  private stopped = false;

  constructor(
    private readonly maintenance: DispatchMaintenance,
    private readonly options: ClockOptions,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    if (!process.env.DATABASE_URL) return;
    this.schedule(3_000);
    this.purgeTimer = setInterval(() => void this.purge(), DAY_MS);
    this.purgeTimer.unref?.();
    setTimeout(() => void this.purge(), 60_000).unref?.();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.purgeTimer);
  }

  reschedule(): void {
    if (this.running) this.again = true;
    else this.schedule(0);
  }

  /** Una pasada (pública para las pruebas): vence lo vencido y programa la próxima. */
  async run(now = () => new Date()): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        const returned = await this.maintenance.expireOffers();
        if (returned) this.logger.log(`${returned} pedido(s) volvieron al panel: nadie aceptó a tiempo`);
      } while (this.again);
      // En la misma pasada (como mucho cada idleMs): turnos de quien dejó de reportar ubicación (RNF-06).
      const closed = await this.maintenance.closeIdleAvailability(AVAILABILITY_IDLE_MINUTES);
      if (closed) this.logger.log(`${closed} turno(s) Disponible cerrados por inactividad`);
      this.schedule(nextSweepDelay(await this.maintenance.nextExpiry(), now(), this.options));
    } catch (error) {
      this.logger.error(`Reloj del despacho: ${(error as Error).message}`);
      this.schedule(this.options.minMs * 10);
    } finally {
      this.running = false;
    }
  }

  private async purge(): Promise<void> {
    try {
      const deleted = await this.maintenance.purgeLocations();
      if (deleted) this.logger.log(`${deleted} ubicaciones viejas borradas (retención)`);
    } catch (error) {
      this.logger.error(`Retención de ubicaciones: ${(error as Error).message}`);
    }
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
    this.timer.unref?.();
  }
}
