import { Injectable } from '@nestjs/common';
import { Establishment, EstablishmentCategory } from '../../domain/entities/establishment.entity';
import { EstablishmentRepository, NearbyQuery, NearbyResult } from '../../domain/repositories/establishment.repository';
import { GeoPoint } from '../../domain/value-objects/geo-point';

/**
 * Repositorio en memoria para desarrollo local sin base de datos y para pruebas.
 * Los datos son de ejemplo; se reemplazan por el catálogo real en PostgreSQL.
 */
@Injectable()
export class InMemoryEstablishmentRepository extends EstablishmentRepository {
  private readonly items: Establishment[] = [
    Establishment.create('demo-1', {
      name: 'Burger Demo',
      category: EstablishmentCategory.FAST_FOOD,
      location: GeoPoint.create(4.6097, -74.0817),
      address: 'Dirección de ejemplo 1',
      isActive: true,
      isPartner: false,
    }),
    Establishment.create('demo-2', {
      name: 'Pizza Demo',
      category: EstablishmentCategory.FAST_FOOD,
      location: GeoPoint.create(4.6125, -74.0785),
      address: 'Dirección de ejemplo 2',
      isActive: true,
      isPartner: false,
    }),
    Establishment.create('demo-3', {
      name: 'Súper Demo',
      category: EstablishmentCategory.SUPERMARKET,
      location: GeoPoint.create(4.6062, -74.0851),
      address: 'Dirección de ejemplo 3',
      isActive: true,
      isPartner: false,
    }),
  ];

  async findNearby(query: NearbyQuery): Promise<NearbyResult[]> {
    return this.items
      .filter((e) => e.isActive)
      .filter((e) => !query.categories?.length || query.categories.includes(e.category))
      .map((establishment) => ({
        establishment,
        distanceMeters: Math.round(query.origin.distanceTo(establishment.location)),
      }))
      .filter((r) => r.distanceMeters <= query.radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, query.limit);
  }
}
