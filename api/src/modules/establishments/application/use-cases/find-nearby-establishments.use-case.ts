import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain/domain.error';
import { EstablishmentCategory } from '../../domain/entities/establishment.entity';
import { EstablishmentRepository, NearbyResult } from '../../domain/repositories/establishment.repository';
import { GeoPoint } from '../../domain/value-objects/geo-point';

export interface FindNearbyEstablishmentsInput {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  categories?: EstablishmentCategory[];
  limit?: number;
}

const DEFAULT_RADIUS = 3_000;
const MAX_RADIUS = 15_000;

@Injectable()
export class FindNearbyEstablishmentsUseCase {
  constructor(private readonly repository: EstablishmentRepository) {}

  async execute(input: FindNearbyEstablishmentsInput): Promise<NearbyResult[]> {
    const radiusMeters = input.radiusMeters ?? DEFAULT_RADIUS;
    if (radiusMeters <= 0 || radiusMeters > MAX_RADIUS) {
      throw new DomainError(`El radio debe estar entre 1 y ${MAX_RADIUS} metros`, 'INVALID_RADIUS');
    }
    return this.repository.findNearby({
      origin: GeoPoint.create(input.latitude, input.longitude),
      radiusMeters,
      categories: input.categories,
      limit: Math.min(input.limit ?? 50, 100),
    });
  }
}
