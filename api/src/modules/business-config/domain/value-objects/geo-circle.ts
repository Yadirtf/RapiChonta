import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { GeoPolygon, PolygonLimits } from '../../../catalog/domain/value-objects/geo-polygon';
import { BusinessErrors } from '../business-config.errors';

/** Radio de una cobertura: desde unas cuadras alrededor de la plaza hasta las veredas de un municipio grande. */
export const RADIUS_LIMITS = { minMeters: 200, maxMeters: 15_000 } as const;

/** Vértices del polígono que aproxima el círculo: a 15 km la cuerda se separa del arco menos de 30 m. */
const SEGMENTS = 72;
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Cobertura trazada como radio alrededor de un centro (la plaza, la galería). Se guarda como el polígono que
 * la aproxima, así el pedido sigue validándose con ST_Covers; centro y radio se recuperan del polígono al leer.
 */
export class GeoCircle {
  private constructor(
    readonly center: GeoPoint,
    readonly radiusMeters: number,
  ) {}

  static create(center: GeoPoint, radiusMeters: number): GeoCircle {
    if (!Number.isFinite(radiusMeters) || radiusMeters < RADIUS_LIMITS.minMeters || radiusMeters > RADIUS_LIMITS.maxMeters) {
      throw BusinessErrors.invalidRadius(RADIUS_LIMITS.minMeters, RADIUS_LIMITS.maxMeters);
    }
    return new GeoCircle(center, Math.round(radiusMeters));
  }

  /** Vértices [lng, lat] a `radiusMeters` del centro sobre la esfera (rumbo inicial, no proyección plana). */
  ring(): [number, number][] {
    const φ1 = toRad(this.center.latitude);
    const λ1 = toRad(this.center.longitude);
    const δ = this.radiusMeters / EARTH_RADIUS_M;
    return Array.from({ length: SEGMENTS }, (_, i) => {
      const θ = (2 * Math.PI * i) / SEGMENTS;
      const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
      const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
      return [toDeg(λ2), toDeg(φ2)] as [number, number];
    });
  }

  toPolygon(limits: PolygonLimits): GeoPolygon {
    return GeoPolygon.fromRing(this.ring(), limits);
  }
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
