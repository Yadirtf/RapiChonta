import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Establishment, EstablishmentCategory } from '../../domain/entities/establishment.entity';
import { EstablishmentRepository, NearbyQuery, NearbyResult } from '../../domain/repositories/establishment.repository';
import { GeoPoint } from '../../domain/value-objects/geo-point';

interface EstablishmentRow {
  id: string;
  name: string;
  primary_category_code: EstablishmentCategory;
  address_line: string;
  accepts_orders: boolean;
  latitude: number;
  longitude: number;
  distance_meters: number;
}

/**
 * Búsqueda geoespacial con PostGIS (ST_DWithin usa el índice GIST de la columna location).
 * Las reglas de visibilidad (estado del local, municipio lanzado) viven en la vista v_map_establishments.
 */
@Injectable()
export class PrismaEstablishmentRepository extends EstablishmentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findNearby(query: NearbyQuery): Promise<NearbyResult[]> {
    const origin = Prisma.sql`ST_SetSRID(ST_MakePoint(${query.origin.longitude}, ${query.origin.latitude}), 4326)::geography`;
    const categoryFilter = query.categories?.length
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM establishment_category_links l
          JOIN establishment_categories c ON c.id = l.category_id
          WHERE l.establishment_id = e.id AND c.code IN (${Prisma.join(query.categories)}))`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<EstablishmentRow[]>`
      SELECT e.id, e.name, e.primary_category_code, e.address_line, e.accepts_orders,
             ST_Y(e.location::geometry) AS latitude,
             ST_X(e.location::geometry) AS longitude,
             ST_Distance(e.location, ${origin}) AS distance_meters
      FROM v_map_establishments e
      WHERE ST_DWithin(e.location, ${origin}, ${query.radiusMeters})
        ${categoryFilter}
      ORDER BY distance_meters ASC
      LIMIT ${query.limit}
    `;

    return rows.map((row) => ({
      distanceMeters: Math.round(row.distance_meters),
      establishment: Establishment.create(row.id, {
        name: row.name,
        category: row.primary_category_code,
        address: row.address_line,
        acceptsOrders: row.accepts_orders,
        location: GeoPoint.create(row.latitude, row.longitude),
      }),
    }));
  }
}
