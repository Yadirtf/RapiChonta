import type * as GeoJSON from "geojson";
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

const EARTH_RADIUS_M = 6_371_008.8;
const CIRCLE_SEGMENTS = 72;

/**
 * Vértices [lng, lat] de un radio alrededor de `center`, con la misma fórmula que la API (GeoCircle): lo que
 * el panel dibuja mientras se arrastra el control es exactamente lo que se guardará.
 */
export function circleRing(center: GeoPoint, radiusMeters: number, segments = CIRCLE_SEGMENTS): LngLat[] {
  const rad = Math.PI / 180;
  const φ1 = center.lat * rad;
  const λ1 = center.lng * rad;
  const δ = radiusMeters / EARTH_RADIUS_M;
  return Array.from({ length: segments }, (_, i) => {
    const θ = (2 * Math.PI * i) / segments;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    return [λ2 / rad, φ2 / rad] as LngLat;
  });
}

/** Punto dentro de alguno de los polígonos de la cobertura (anillo exterior menos huecos). */
export function coverageContains(polygons: LngLat[][][], point: GeoPoint): boolean {
  return polygons.some(([outer, ...holes]) => contains(outer, point) && !holes.some((hole) => contains(hole, point)));
}

/**
 * Máscara "fuera de cobertura": el mundo con las coberturas recortadas como huecos. Se pinta oscura encima
 * del mapa para que lo que sí cubrimos quede iluminado.
 */
export function outsideMask(polygons: LngLat[][][]): GeoJSON.Feature<GeoJSON.Polygon> {
  const world: LngLat[] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...polygons.map(([outer]) => outer)] } };
}
