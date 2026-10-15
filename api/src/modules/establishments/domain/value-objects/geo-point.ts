import { DomainError } from '../../../../shared/domain/domain.error';

/** Coordenada geográfica WGS84. Inmutable y validada al crearse. */
export class GeoPoint {
  private constructor(
    public readonly latitude: number,
    public readonly longitude: number,
  ) {}

  static create(latitude: number, longitude: number): GeoPoint {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new DomainError('Latitud inválida');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new DomainError('Longitud inválida');
    }
    return new GeoPoint(latitude, longitude);
  }

  /** Distancia en metros (fórmula de Haversine). */
  distanceTo(other: GeoPoint): number {
    const R = 6_371_000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(other.latitude - this.latitude);
    const dLng = toRad(other.longitude - this.longitude);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(this.latitude)) * Math.cos(toRad(other.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
}
