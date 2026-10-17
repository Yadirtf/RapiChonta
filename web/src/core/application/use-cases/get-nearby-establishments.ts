import type { Establishment, GeoPoint } from "../../domain/entities/establishment";
import type { EstablishmentRepository } from "../../domain/repositories/establishment-repository";

/** Radio del mapa de inicio: Villagarzón cabe entero en 3 km desde casi cualquier punto del casco urbano. */
const HOME_RADIUS_METERS = 3000;

export class GetNearbyEstablishments {
  constructor(private readonly repository: EstablishmentRepository) {}

  /** Sin categorías elegidas se muestran todas. */
  execute(origin: GeoPoint, categories: string[] = []): Promise<Establishment[]> {
    return this.repository.findNearby({ origin, categories: categories.length ? categories : undefined, radiusMeters: HOME_RADIUS_METERS });
  }
}
