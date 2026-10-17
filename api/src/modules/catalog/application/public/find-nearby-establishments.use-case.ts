import { Injectable } from '@nestjs/common';
import { CatalogErrors } from '../../domain/catalog.errors';
import { MapEstablishment, PublicCatalogRepository } from '../../domain/ports/public-catalog.repository';
import { GeoPoint } from '../../domain/value-objects/geo-point';

export interface FindNearbyEstablishmentsInput {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  categories?: string[];
  limit?: number;
}

const DEFAULT_RADIUS = 3_000;
const MAX_RADIUS = 15_000;

/** Locales cercanos para el mapa (H02.4). Las reglas de visibilidad viven en v_map_establishments. */
@Injectable()
export class FindNearbyEstablishmentsUseCase {
  constructor(private readonly repository: PublicCatalogRepository) {}

  async execute(input: FindNearbyEstablishmentsInput): Promise<MapEstablishment[]> {
    const radiusMeters = input.radiusMeters ?? DEFAULT_RADIUS;
    if (radiusMeters <= 0 || radiusMeters > MAX_RADIUS) throw CatalogErrors.invalidRadius(MAX_RADIUS);
    return this.repository.nearby({
      origin: GeoPoint.create(input.latitude, input.longitude),
      radiusMeters,
      categories: input.categories?.length ? [...new Set(input.categories)] : undefined,
      limit: Math.min(input.limit ?? 50, 100),
    });
  }
}
