import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { GeoCircle, RADIUS_LIMITS } from './geo-circle';
import { COVERAGE_LIMITS } from './zone-limits';

const PLAZA = GeoPoint.create(1.0294, -76.6165);

describe('GeoCircle (cobertura por radio, H03.5)', () => {
  it('traza vértices a la distancia del radio y el polígono cubre lo de adentro, no lo de afuera', () => {
    const circle = GeoCircle.create(PLAZA, 3_000);
    const ring = circle.ring();
    for (const [lng, lat] of ring) expect(PLAZA.distanceTo(GeoPoint.create(lat, lng))).toBeCloseTo(3_000, -1);
    const polygon = circle.toPolygon(COVERAGE_LIMITS);
    expect(polygon.covers(GeoPoint.create(1.0294 + 0.026, -76.6165))).toBe(true); // ~2,9 km al norte
    expect(polygon.covers(GeoPoint.create(1.0294 + 0.028, -76.6165))).toBe(false); // ~3,1 km al norte
    expect(polygon.squareMeters()).toBeGreaterThan(Math.PI * 3_000 ** 2 * 0.99);
  });

  it('rechaza radios fuera de los límites y redondea al metro', () => {
    expect(() => GeoCircle.create(PLAZA, RADIUS_LIMITS.minMeters - 1)).toThrow(expect.objectContaining({ code: 'INVALID_RADIUS' }));
    expect(() => GeoCircle.create(PLAZA, RADIUS_LIMITS.maxMeters + 1)).toThrow(expect.objectContaining({ code: 'INVALID_RADIUS' }));
    expect(() => GeoCircle.create(PLAZA, Number.NaN)).toThrow(expect.objectContaining({ code: 'INVALID_RADIUS' }));
    expect(GeoCircle.create(PLAZA, 1_250.4).radiusMeters).toBe(1_250);
    // El radio máximo cabe en los límites de una cobertura.
    expect(() => GeoCircle.create(PLAZA, RADIUS_LIMITS.maxMeters).toPolygon(COVERAGE_LIMITS)).not.toThrow();
  });
});
