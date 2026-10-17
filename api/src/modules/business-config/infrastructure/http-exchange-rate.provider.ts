import { Injectable } from '@nestjs/common';
import { DisplayCurrencyCode } from '../domain/business-config.codes';
import { ExchangeRateProvider } from '../domain/ports/exchange-rates';

type Quote = { currency: DisplayCurrencyCode; copPerUnit: string };

/** Pesos por unidad a partir de "unidades por 1 USD": solo para mostrar (≈), 4 decimales bastan. */
function fromUsdBase(copPerUsd: unknown, eurPerUsd: unknown): Quote[] {
  const cop = Number(copPerUsd);
  const eur = Number(eurPerUsd);
  if (!(cop > 0)) throw new Error('respuesta sin COP');
  const quotes: Quote[] = [{ currency: 'USD', copPerUnit: cop.toFixed(4) }];
  if (eur > 0) quotes.push({ currency: 'EUR', copPerUnit: (cop / eur).toFixed(4) });
  return quotes;
}

/** Proveedores públicos sin clave, en orden. Si el primero falla se usa el siguiente. */
const SOURCES: { name: string; url: string; parse: (body: any) => Quote[] }[] = [
  {
    name: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    parse: (body) => {
      if (body?.result !== 'success') throw new Error('respuesta sin éxito');
      return fromUsdBase(body.rates?.COP, body.rates?.EUR);
    },
  },
  {
    name: 'fawazahmed0/currency-api',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    parse: (body) => fromUsdBase(body?.usd?.cop, body?.usd?.eur),
  },
];

@Injectable()
export class HttpExchangeRateProvider extends ExchangeRateProvider {
  async fetch(): Promise<{ source: string; rates: Quote[] }> {
    const errors: string[] = [];
    for (const source of SOURCES) {
      try {
        const response = await fetch(source.url, { signal: AbortSignal.timeout(8_000), headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { source: source.name, rates: source.parse(await response.json()) };
      } catch (error) {
        errors.push(`${source.name}: ${error instanceof Error ? error.message : error}`);
      }
    }
    throw new Error(errors.join('; '));
  }
}
