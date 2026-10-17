import { DisplayCurrencyCode } from '../business-config.codes';

export interface ExchangeRate {
  currency: DisplayCurrencyCode;
  /** Pesos colombianos por una unidad de la moneda, texto decimal ("4012.3456"). */
  copPerUnit: string;
  source: string;
  fetchedAt: Date;
}

/** Tasas guardadas (exchange_rates): una fila por consulta; la vigente es la última. */
export abstract class ExchangeRatesRepository {
  abstract current(): Promise<ExchangeRate[]>;
  abstract save(rates: ExchangeRate[]): Promise<void>;
}

/** Proveedor público de tasas (H03.4). Se usa solo para mostrar el aproximado; nunca para cobrar. */
export abstract class ExchangeRateProvider {
  abstract fetch(): Promise<{ source: string; rates: { currency: DisplayCurrencyCode; copPerUnit: string }[] }>;
}
