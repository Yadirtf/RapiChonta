import { CatalogErrors } from '../catalog.errors';
import { GeoPoint } from './geo-point';

/** Límites del área de un local: cubre el local y su entrada, no una manzana entera (geocerca de H08.3). */
export const AREA_LIMITS = { minVertices: 3, maxVertices: 100, minSquareMeters: 4, maxSquareMeters: 40_000 } as const;
export type PolygonLimits = { readonly [K in keyof typeof AREA_LIMITS]: number };

/**
 * Polígono simple (un solo anillo, sin cruces) dibujado a mano en el mapa (H02.1, RF-10).
 * Se valida aquí, sin base de datos; PostgreSQL vuelve a verificar con ST_IsValid y ST_Covers.
 */
export class GeoPolygon {
  private constructor(readonly vertices: readonly GeoPoint[]) {}

  /**
   * `ring`: vértices [lng, lat] (orden GeoJSON). Si el último repite el primero, se quita.
   * `limits`: por defecto los del área de un local; las zonas de entrega (E03) usan otros más amplios.
   */
  static fromRing(ring: readonly (readonly [number, number])[], limits: PolygonLimits = AREA_LIMITS): GeoPolygon {
    if (!Array.isArray(ring) || ring.length > limits.maxVertices + 1) throw CatalogErrors.invalidArea(Array.isArray(ring) ? 'TOO_MANY_VERTICES' : 'FORMAT');
    if (!ring.every((v) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number'))) throw CatalogErrors.invalidArea('FORMAT');
    const points = ring.map(([lng, lat]) => GeoPoint.create(lat, lng));
    if (points.length > 1 && points[0].equals(points[points.length - 1])) points.pop();
    const unique = points.filter((p, i) => i === 0 || !p.equals(points[i - 1]));

    if (unique.length < limits.minVertices) throw CatalogErrors.invalidArea('TOO_FEW_VERTICES');
    if (unique.length > limits.maxVertices) throw CatalogErrors.invalidArea('TOO_MANY_VERTICES');
    const polygon = new GeoPolygon(unique);
    if (polygon.selfIntersects()) throw CatalogErrors.invalidArea('SELF_INTERSECTION');
    const area = polygon.squareMeters();
    if (area < limits.minSquareMeters) throw CatalogErrors.invalidArea('TOO_SMALL');
    if (area > limits.maxSquareMeters) throw CatalogErrors.invalidArea('TOO_LARGE');
    return polygon;
  }

  /** Cuadrado de `halfSideMeters` alrededor del punto: área por defecto cuando la carga masiva no trae dibujo. */
  static squareAround(center: GeoPoint, halfSideMeters: number): GeoPolygon {
    const dLat = halfSideMeters / 111_320;
    const dLng = halfSideMeters / (111_320 * Math.cos((center.latitude * Math.PI) / 180));
    const { latitude: lat, longitude: lng } = center;
    return GeoPolygon.fromRing([
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
    ]);
  }

  /** Anillo cerrado [lng, lat] para GeoJSON / WKT. */
  closedRing(): [number, number][] {
    const ring = this.vertices.map((p) => [p.longitude, p.latitude] as [number, number]);
    return [...ring, ring[0]];
  }

  toWkt(): string {
    return `POLYGON((${this.closedRing().map(([lng, lat]) => `${lng} ${lat}`).join(', ')}))`;
  }

  /** Punto dentro o en el borde (equivale a ST_Covers en distancias tan cortas). */
  covers(point: GeoPoint): boolean {
    const [x, y] = this.project(point);
    const ring = this.vertices.map((v) => this.project(v));
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (onSegment([x, y], ring[j], ring[i])) return true;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** Área aproximada en m² (proyección equirrectangular local: error mínimo para polígonos de decenas de metros). */
  squareMeters(): number {
    const ring = this.vertices.map((v) => this.project(v));
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return Math.abs(sum) / 2;
  }

  private selfIntersects(): boolean {
    const ring = this.vertices.map((v) => this.project(v));
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a1 = ring[i];
      const a2 = ring[(i + 1) % n];
      for (let j = i + 1; j < n; j++) {
        // Lados vecinos comparten un vértice: no cuentan como cruce.
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        if (segmentsIntersect(a1, a2, ring[j], ring[(j + 1) % n])) return true;
      }
    }
    return false;
  }

  /** Metros respecto al primer vértice. */
  private project(point: GeoPoint): [number, number] {
    const origin = this.vertices[0];
    const metersPerDegLat = 111_320;
    const metersPerDegLng = 111_320 * Math.cos((origin.latitude * Math.PI) / 180);
    return [(point.longitude - origin.longitude) * metersPerDegLng, (point.latitude - origin.latitude) * metersPerDegLat];
  }
}

type Vec = [number, number];
const cross = (o: Vec, a: Vec, b: Vec) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const EPSILON = 1e-9;

function onSegment(p: Vec, a: Vec, b: Vec): boolean {
  return (
    Math.abs(cross(a, b, p)) < EPSILON &&
    p[0] >= Math.min(a[0], b[0]) - EPSILON &&
    p[0] <= Math.max(a[0], b[0]) + EPSILON &&
    p[1] >= Math.min(a[1], b[1]) - EPSILON &&
    p[1] <= Math.max(a[1], b[1]) + EPSILON
  );
}

function segmentsIntersect(p1: Vec, p2: Vec, p3: Vec, p4: Vec): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) && ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))) {
    return true;
  }
  return onSegment(p1, p3, p4) || onSegment(p2, p3, p4) || onSegment(p3, p1, p2) || onSegment(p4, p1, p2);
}
