import type { Establishment, EstablishmentCategory, GeoPoint } from "../entities/establishment";

/** Puerto: la capa de aplicación depende de esta interfaz, no de fetch ni de la URL de la API. */
export interface EstablishmentRepository {
  findNearby(params: {
    origin: GeoPoint;
    radiusMeters?: number;
    categories?: EstablishmentCategory[];
  }): Promise<Establishment[]>;
}
