import { HttpExchangeRateProvider } from './http-exchange-rate.provider';

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

describe('Proveedor de tasas (H03.4)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('convierte "unidades por USD" a pesos por USD y por EUR', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(json({ result: 'success', rates: { COP: 4000, EUR: 0.8 } }));
    await expect(new HttpExchangeRateProvider().fetch()).resolves.toEqual({
      source: 'open.er-api.com',
      rates: [
        { currency: 'USD', copPerUnit: '4000.0000' },
        { currency: 'EUR', copPerUnit: '5000.0000' },
      ],
    });
  });

  it('si el primero falla usa el segundo, y si todos fallan explica por qué', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    fetch.mockResolvedValueOnce(json({}, false)).mockResolvedValueOnce(json({ usd: { cop: 3900.5, eur: 0.9 } }));
    await expect(new HttpExchangeRateProvider().fetch()).resolves.toMatchObject({ source: 'fawazahmed0/currency-api' });
    fetch.mockRejectedValueOnce(new Error('sin red')).mockResolvedValueOnce(json({ usd: {} }));
    await expect(new HttpExchangeRateProvider().fetch()).rejects.toThrow(/sin red.*sin COP/);
  });
});
