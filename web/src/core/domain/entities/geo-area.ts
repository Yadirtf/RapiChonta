import type { LngLat } from "./catalog-admin";
import type { GeoPoint } from "./establishment";

/**
 * Geometría del área de un local dibujada en el panel. Es la misma validación que hace la API
 * (GeoPolygon); aquí sirve para avisar mientras se dibuja, la API vuelve a verificar al guardar.
 */
export type AreaProblem = "TOO_FEW_VERTICES" | "TOO_MANY_VERTICES" | "SELF_INTERSECTION" | "TOO_SMALL" | "TOO_LARGE" | "NOT_COVERING";

const EARTH_RADIUS = 6_371_008.8;
const RAD = Math.PI / 180;

/** Proyección local en metros alrededor de una latitud: suficiente para áreas de unas decenas de metros. */
function projector(latitude: number) {
  const k = Math.cos(latitude * RAD);
  return ([lng, lat]: LngLat) => [lng * RAD * EARTH_RADIUS * k, lat * RAD * EARTH_RADIUS] as const;
}

export function squareMeters(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const project = projector(ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length);
  const points = ring.map(project);
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

const orientation = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
  Math.sign((b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]));

function segmentsCross(p1: LngLat, p2: LngLat, q1: LngLat, q2: LngLat) {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

export function selfIntersects(ring: LngLat[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Lados vecinos comparten un vértice: no cuentan como cruce.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Punto dentro del polígono (rayo horizontal). */
export function contains(ring: LngLat[], point: GeoPoint): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Cuadrado de `halfSide` metros a cada lado del punto (área rápida para tiendas pequeñas). */
export function squareAround(point: GeoPoint, halfSide: number): LngLat[] {
  const dLat = halfSide / (EARTH_RADIUS * RAD);
  const dLng = dLat / Math.cos(point.lat * RAD);
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return [
    [r(point.lng - dLng), r(point.lat - dLat)],
    [r(point.lng + dLng), r(point.lat - dLat)],
    [r(point.lng + dLng), r(point.lat + dLat)],
    [r(point.lng - dLng), r(point.lat + dLat)],
  ];
}

export interface AreaLimits {
  minVertices: number;
  maxVertices: number;
  minSquareMeters: number;
  maxSquareMeters: number;
}

export function areaProblem(ring: LngLat[], location: GeoPoint, limits: AreaLimits): AreaProblem | null {
  if (ring.length < limits.minVertices) return "TOO_FEW_VERTICES";
  if (ring.length > limits.maxVertices) return "TOO_MANY_VERTICES";
  if (selfIntersects(ring)) return "SELF_INTERSECTION";
  const area = squareMeters(ring);
  if (area < limits.minSquareMeters) return "TOO_SMALL";
  if (area > limits.maxSquareMeters) return "TOO_LARGE";
  if (!contains(ring, location)) return "NOT_COVERING";
  return null;
}

export const midpoint = (a: LngLat, b: LngLat): LngLat => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

export const roundVertex = ([lng, lat]: LngLat): LngLat => [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
