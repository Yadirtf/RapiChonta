import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { HttpRoutePlanner } from './http-route-planner';

const from = GeoPoint.create(1.0251, -76.6122);
const to = GeoPoint.create(1.0294, -76.6165);
const line = [[-76.6122, 1.0251], [-76.614, 1.027], [-76.6165, 1.0294]];

const respond = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

describe('HttpRoutePlanner', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('sin clave usa OSRM y lee línea, metros y segundos', async () => {
    fetchMock.mockResolvedValue(respond({ code: 'Ok', routes: [{ geometry: { coordinates: line }, distance: 812.4, duration: 133.2 }] }));
    const planner = new HttpRoutePlanner({ osrmUrl: 'https://osrm.example/' });
    expect(await planner.plan(from, to)).toEqual({ line, distanceMeters: 812.4, durationSeconds: 133.2 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://osrm.example/route/v1/driving/-76.6122,1.0251;-76.6165,1.0294?overview=full&geometries=geojson');
  });

  it('con clave usa OpenRouteService', async () => {
    fetchMock.mockResolvedValue(respond({ features: [{ geometry: { coordinates: line }, properties: { summary: { distance: 900, duration: 150 } } }] }));
    const planner = new HttpRoutePlanner({ orsApiKey: 'clave', osrmUrl: 'https://osrm.example' });
    expect(await planner.plan(from, to)).toEqual({ line, distanceMeters: 900, durationSeconds: 150 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('openrouteservice.org/v2/directions/driving-car');
    expect(init.headers.Authorization).toBe('clave');
  });

  it('reutiliza la ruta pedida desde casi el mismo punto por un par de minutos', async () => {
    fetchMock.mockResolvedValue(respond({ code: 'Ok', routes: [{ geometry: { coordinates: line }, distance: 1, duration: 1 }] }));
    const planner = new HttpRoutePlanner({ osrmUrl: 'https://osrm.example' });
    await planner.plan(from, to, 0);
    await planner.plan(GeoPoint.create(1.02512, -76.61221), to, 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await planner.plan(from, to, 5 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('si el servicio falla devuelve null (la app sigue con "Cómo llegar")', async () => {
    fetchMock.mockResolvedValue(respond({ code: 'NoRoute' }));
    expect(await new HttpRoutePlanner({ osrmUrl: 'https://osrm.example' }).plan(from, to)).toBeNull();
    fetchMock.mockRejectedValue(new Error('sin red'));
    expect(await new HttpRoutePlanner({ osrmUrl: 'https://osrm.example' }).plan(from, to)).toBeNull();
  });
});
