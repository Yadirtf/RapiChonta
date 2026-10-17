import { GeoPoint } from './geo-point';
import { GeoPolygon } from './geo-polygon';

// Rectángulo de ~33 x 22 m alrededor de (1.03, -76.615), en Villagarzón.
const RECT: [number, number][] = [
  [-76.61515, 1.0299],
  [-76.61485, 1.0299],
  [-76.61485, 1.0301],
  [-76.61515, 1.0301],
];

describe('GeoPolygon', () => {
  it('acepta un polígono simple, quita el cierre repetido y calcula el área', () => {
    const polygon = GeoPolygon.fromRing([...RECT, RECT[0]]);
    expect(polygon.vertices).toHaveLength(4);
    expect(polygon.squareMeters()).toBeGreaterThan(700);
    expect(polygon.squareMeters()).toBeLessThan(780);
    expect(polygon.closedRing()).toHaveLength(5);
    expect(polygon.toWkt()).toMatch(/^POLYGON\(\(-76\.61515 1\.0299, .*-76\.61515 1\.0299\)\)$/);
  });

  it('dice si el punto del local queda dentro o en el borde', () => {
    const polygon = GeoPolygon.fromRing(RECT);
    expect(polygon.covers(GeoPoint.create(1.03, -76.615))).toBe(true);
    expect(polygon.covers(GeoPoint.create(1.0299, -76.615))).toBe(true);
    expect(polygon.covers(GeoPoint.create(1.031, -76.615))).toBe(false);
  });

  it.each([
    ['SELF_INTERSECTION', [RECT[0], RECT[2], RECT[1], RECT[3]]],
    ['TOO_FEW_VERTICES', [RECT[0], RECT[1], RECT[0]]],
    ['TOO_LARGE', [[-76.62, 1.02], [-76.6, 1.02], [-76.6, 1.04], [-76.62, 1.04]]],
    ['TOO_SMALL', [[-76.615, 1.03], [-76.61499, 1.03], [-76.61499, 1.03001]]],
    ['FORMAT', [[-76.615, 1.03], [-76.615], [1, 2]]],
  ])('rechaza polígonos inválidos (%s)', (reason, ring) => {
    expect(() => GeoPolygon.fromRing(ring as [number, number][])).toThrow(expect.objectContaining({ code: 'INVALID_AREA', details: { reason } }));
  });

  it('rechaza coordenadas fuera de rango', () => {
    expect(() => GeoPolygon.fromRing([[-200, 1], [-76, 1], [-76, 2]])).toThrow(expect.objectContaining({ code: 'INVALID_LOCATION' }));
  });

  it('arma un cuadrado alrededor del punto para la carga masiva', () => {
    const center = GeoPoint.create(1.0294, -76.6165);
    const square = GeoPolygon.squareAround(center, 12);
    expect(square.covers(center)).toBe(true);
    expect(square.squareMeters()).toBeCloseTo(576, -1);
  });
});
