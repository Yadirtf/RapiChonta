import type { Establishment } from "@/core/domain/entities/establishment";
import type { EstablishmentRepository } from "@/core/domain/repositories/establishment-repository";
import { apiGet } from "../http/api-client";

export class HttpEstablishmentRepository implements EstablishmentRepository {
  findNearby({ origin, radiusMeters, categories }: Parameters<EstablishmentRepository["findNearby"]>[0]) {
    return apiGet<Establishment[]>("/establishments/nearby", {
      lat: origin.lat,
      lng: origin.lng,
      radius: radiusMeters,
      categories: categories?.join(","),
    });
  }
}
