import type { Establishment, EstablishmentCategory, GeoPoint } from "../../domain/entities/establishment";
import type { EstablishmentRepository } from "../../domain/repositories/establishment-repository";

export class GetNearbyEstablishments {
  constructor(private readonly repository: EstablishmentRepository) {}

  execute(origin: GeoPoint, categories: EstablishmentCategory[] = ["FAST_FOOD", "RESTAURANT"]): Promise<Establishment[]> {
    return this.repository.findNearby({ origin, categories, radiusMeters: 3000 });
  }
}
