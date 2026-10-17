import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ExchangeRatesUseCase } from '../application/exchange-rates.use-cases';

const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 60 * 60_000;

/**
 * Guarda la tasa USD y EUR una vez al día (H03.4). Revisa cada hora si ya hay tasa de hoy; si el
 * proveedor falla, el cliente sigue viendo la última disponible con su fecha. EXCHANGE_RATES_ENABLED=false lo apaga.
 */
@Injectable()
export class ExchangeRatesScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly rates: ExchangeRatesUseCase) {}

  onApplicationBootstrap(): void {
    if (!process.env.DATABASE_URL || process.env.EXCHANGE_RATES_ENABLED === 'false' || process.env.NODE_ENV === 'test') return;
    const run = () => void this.rates.refresh().catch((error) => new Logger('ExchangeRates').warn(String(error)));
    this.timers = [setTimeout(run, FIRST_CHECK_MS), setInterval(run, CHECK_EVERY_MS)];
    this.timers.forEach((t) => t.unref());
  }

  onApplicationShutdown(): void {
    this.timers.forEach((t) => clearTimeout(t));
  }
}
