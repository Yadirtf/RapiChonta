import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { plausibleReadings } from './location-plausibility';

const at = (lat: number, lng: number, iso: string) => ({ location: GeoPoint.create(lat, lng), recordedAt: new Date(iso) });

describe('plausibleReadings (H08.3: GPS simulado)', () => {
  it('acepta el recorrido normal en moto, aunque lleguen desordenadas', () => {
    const accepted = plausibleReadings(null, [at(1.0312, -76.6158, '2026-10-21T12:00:10Z'), at(1.0306, -76.6158, '2026-10-21T12:00:00Z')]);
    expect(accepted.map((r) => r.recordedAt.toISOString())).toEqual(['2026-10-21T12:00:00.000Z', '2026-10-21T12:00:10.000Z']);
  });

  it('descarta un salto imposible sin arrastrar las lecturas siguientes', () => {
    const previous = at(1.0306, -76.6158, '2026-10-21T11:59:55Z');
    const accepted = plausibleReadings(previous, [
      at(1.5, -76.6158, '2026-10-21T12:00:00Z'), // 52 km en 5 s
      at(1.0307, -76.6158, '2026-10-21T12:00:05Z'),
    ]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].location.latitude).toBe(1.0307);
  });

  it('el temblor normal del GPS (unos metros de golpe) no es un salto', () => {
    const accepted = plausibleReadings(at(1.0306, -76.6158, '2026-10-21T12:00:00Z'), [at(1.0316, -76.6158, '2026-10-21T12:00:01Z')]);
    expect(accepted).toHaveLength(1);
  });

  it('descarta duplicados con la misma hora (reenvíos de la cola sin señal)', () => {
    const previous = at(1.0306, -76.6158, '2026-10-21T12:00:00Z');
    expect(plausibleReadings(previous, [at(1.0306, -76.6158, '2026-10-21T12:00:00Z')])).toHaveLength(0);
  });
});
