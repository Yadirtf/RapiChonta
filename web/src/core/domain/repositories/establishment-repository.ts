import type { Category, Establishment, EstablishmentDetail, GeoPoint } from "../entities/establishment";

/** Puerto: la capa de aplicación depende de esta interfaz, no de fetch ni de la URL de la API. */
export interface EstablishmentRepository {
  findNearby(params: { origin: GeoPoint; radiusMeters?: number; categories?: string[] }): Promise<Establishment[]>;
  categories(): Promise<Category[]>;
  findById(id: string, params: { language: string; origin?: GeoPoint | null }): Promise<EstablishmentDetail>;
}
