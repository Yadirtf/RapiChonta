import { ExchangeRate, ExchangeRateProvider, ExchangeRatesRepository } from '../domain/ports/exchange-rates';
import { ExchangeRatesUseCase } from './exchange-rates.use-cases';

class MemoryRates extends ExchangeRatesRepository {
  rows: ExchangeRate[] = [];
  async current() {
    const latest = new Map<string, ExchangeRate>();
    for (const row of this.rows) if (!latest.has(row.currency) || latest.get(row.currency)!.fetchedAt < row.fetchedAt) latest.set(row.currency, row);
    return [...latest.values()];
  }
  async save(rates: ExchangeRate[]) {
    this.rows.push(...rates);
  }
}

class FakeProvider extends ExchangeRateProvider {
  calls = 0;
  fail = false;
  async fetch() {
    this.calls++;
    if (this.fail) throw new Error('sin red');
    return { source: 'fake', rates: [{ currency: 'USD' as const, copPerUnit: '4000.0000' }, { currency: 'EUR' as const, copPerUnit: '4500.0000' }] };
  }
}

const setup = () => {
  const repository = new MemoryRates();
  const provider = new FakeProvider();
  return { repository, provider, useCase: new ExchangeRatesUseCase(repository, provider) };
};

describe('Tasas de cambio (H03.4)', () => {
  it('consulta una sola vez por día de Colombia', async () => {
    const { provider, useCase } = setup();
    const morning = new Date('2026-10-19T13:00:00Z');
    const rates = await useCase.refresh({ now: morning });
    expect(rates.map((r) => [r.currency, r.copPerUnit, r.isToday])).toEqual([
      ['USD', '4000.0000', true],
      ['EUR', '4500.0000', true],
    ]);
    await useCase.refresh({ now: new Date('2026-10-20T04:00:00Z') }); // 23:00 del mismo día en Bogotá
    expect(provider.calls).toBe(1);
    await useCase.refresh({ now: new Date('2026-10-20T06:00:00Z') }); // ya es el día siguiente
    expect(provider.calls).toBe(2);
  });

  it('si el proveedor falla se conserva la última tasa marcada como de otro día', async () => {
    const { provider, useCase } = setup();
    await useCase.refresh({ now: new Date('2026-10-19T13:00:00Z') });
    provider.fail = true;
    const rates = await useCase.refresh({ now: new Date('2026-10-21T13:00:00Z') });
    expect(rates.every((r) => !r.isToday && r.fetchedAt.toISOString() === '2026-10-19T13:00:00.000Z')).toBe(true);
    await expect(useCase.refresh({ force: true, now: new Date('2026-10-21T13:00:00Z') })).rejects.toMatchObject({ code: 'EXCHANGE_RATES_UNAVAILABLE' });
  });
});
