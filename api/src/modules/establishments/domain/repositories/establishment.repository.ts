import { Establishment, EstablishmentCategory } from '../entities/establishment.entity';
import { GeoPoint } from '../value-objects/geo-point';

export interface NearbyQuery {
  origin: GeoPoint;
  radiusMeters: number;
  categories?: EstablishmentCategory[];
  limit: number;
}

export interface NearbyResult {
  establishment: Establishment;
  distanceMeters: number;
}

/** Puerto (interfaz) del repositorio. La infraestructura lo implementa; el dominio no sabe de Prisma ni de SQL. */
export abstract class EstablishmentRepository {
  abstract findNearby(query: NearbyQuery): Promise<NearbyResult[]>;
}
