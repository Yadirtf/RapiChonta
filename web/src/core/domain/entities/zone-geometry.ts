import type { LngLat } from "./catalog-admin";
import type { ZoneLimits } from "./business";
import type { GeoPoint } from "./establishment";
import { contains, selfIntersects, squareMeters } from "./geo-area";

/** Problemas del polígono de una zona mientras se dibuja (la API vuelve a validar y revisa superposiciones). */
export type ZoneProblem = "TOO_FEW_VERTICES" | "TOO_MANY_VERTICES" | "SELF_INTERSECTION" | "TOO_SMALL" | "TOO_LARGE";

export function zoneProblem(ring: LngLat[], limits: ZoneLimits): ZoneProblem | null {
  if (ring.length < limits.minVertices) return "TOO_FEW_VERTICES";
  if (ring.length > limits.maxVertices) return "TOO_MANY_VERTICES";
  if (selfIntersects(ring)) return "SELF_INTERSECTION";
  const area = squareMeters(ring);
  if (area < limits.minSquareMeters) return "TOO_SMALL";
  if (area > limits.maxSquareMeters) return "TOO_LARGE";
  return null;
}

/** Zona que cubre un punto, en el mismo orden en que la API desempata (sortOrder). */
export function zoneAt<T extends { area: LngLat[]; sortOrder: number }>(zones: T[], point: GeoPoint): T | null {
  return [...zones].sort((a, b) => a.sortOrder - b.sortOrder).find((z) => contains(z.area, point)) ?? null;
}

/** Centro aproximado para poner la etiqueta (promedio de vértices; basta para polígonos de barrio o vereda). */
export function labelPoint(ring: LngLat[]): LngLat {
  const [lng, lat] = ring.reduce(([x, y], [a, b]) => [x + a, y + b], [0, 0]);
  return [lng / ring.length, lat / ring.length];
}

export function boundsOf(rings: LngLat[][]): [LngLat, LngLat] | null {
  const points = rings.flat();
  if (!points.length) return null;
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export { squareMeters };
