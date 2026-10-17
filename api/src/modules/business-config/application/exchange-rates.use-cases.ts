import { Injectable, Logger } from '@nestjs/common';
import { BusinessErrors } from '../domain/business-config.errors';
import { DISPLAY_CURRENCIES } from '../domain/business-config.codes';
import { ExchangeRate, ExchangeRateProvider, ExchangeRatesRepository } from '../domain/ports/exchange-rates';
import { OpeningCalendar } from '../domain/value-objects/opening-calendar';

/** Las tasas se guardan una vez por día de Colombia (H03.4). */
const RATES_TIME_ZONE = 'America/Bogota';
const localDay = (instant: Date) => new OpeningCalendar(RATES_TIME_ZONE, []).localDate(instant);

export interface DisplayRate extends ExchangeRate {
  /** false = no hay tasa de hoy y se muestra la última disponible con su fecha. */
  isToday: boolean;
}

@Injectable()
export class ExchangeRatesUseCase {
  private readonly logger = new Logger('ExchangeRates');

  constructor(
    private readonly repository: ExchangeRatesRepository,
    private readonly provider: ExchangeRateProvider,
  ) {}

  async current(now = new Date()): Promise<DisplayRate[]> {
    const today = localDay(now);
    return (await this.repository.current()).map((rate) => ({ ...rate, isToday: localDay(rate.fetchedAt) === today }));
  }

  /** Consulta el proveedor si todavía no hay tasa de hoy para todas las monedas (o si `force`). */
  async refresh(options: { force?: boolean; now?: Date } = {}): Promise<DisplayRate[]> {
    const now = options.now ?? new Date();
    const current = await this.current(now);
    const fresh = DISPLAY_CURRENCIES.every((code) => current.some((r) => r.currency === code && r.isToday));
    if (fresh && !options.force) return current;
    try {
      const { source, rates } = await this.provider.fetch();
      const valid = rates.filter((r) => DISPLAY_CURRENCIES.includes(r.currency) && Number(r.copPerUnit) > 0);
      if (!valid.length) throw new Error('el proveedor no devolvió tasas');
      await this.repository.save(valid.map((r) => ({ ...r, source, fetchedAt: now })));
      this.logger.log(`Tasas actualizadas desde ${source}: ${valid.map((r) => `${r.currency} ${r.copPerUnit}`).join(', ')}`);
    } catch (error) {
      this.logger.warn(`No se pudo actualizar la tasa de cambio: ${error instanceof Error ? error.message : error}`);
      if (options.force) throw BusinessErrors.exchangeRatesUnavailable();
    }
    return this.current(now);
  }
}
