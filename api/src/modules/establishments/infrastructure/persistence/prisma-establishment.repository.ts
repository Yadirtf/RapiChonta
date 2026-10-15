import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Establishment, EstablishmentCategory } from '../../domain/entities/establishment.entity';
import { EstablishmentRepository, NearbyQuery, NearbyResult } from '../../domain/repositories/establishment.repository';
import { GeoPoint } from '../../domain/value-objects/geo-point';

interface EstablishmentRow {
  id: string;
  name: string;
  category: EstablishmentCategory;
  address: string;
  is_active: boolean;
  is_partner: boolean;
  logo_url: string | null;
  latitude: number;
  longitude: number;
  distance_meters: number;
}

/** Búsqueda geoespacial con PostGIS (ST_DWithin usa el índice GIST de la columna location). */
@Injectable()
export class PrismaEstablishmentRepository extends EstablishmentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findNearby(query: NearbyQuery): Promise<NearbyResult[]> {
    const origin = Prisma.sql`ST_SetSRID(ST_MakePoint(${query.origin.longitude}, ${query.origin.latitude}), 4326)::geography`;
    const categoryFilter = query.categories?.length
      ? Prisma.sql`AND category::text IN (${Prisma.join(query.categories)})`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<EstablishmentRow[]>`
      SELECT id, name, category, address, is_active, is_partner, logo_url,
             ST_Y(location::geometry) AS latitude,
             ST_X(location::geometry) AS longitude,
             ST_Distance(location, ${origin}) AS distance_meters
      FROM establishments
      WHERE is_active = true
        AND ST_DWithin(location, ${origin}, ${query.radiusMeters})
        ${categoryFilter}
      ORDER BY distance_meters ASC
      LIMIT ${query.limit}
    `;

    return rows.map((row) => ({
      distanceMeters: Math.round(row.distance_meters),
      establishment: Establishment.create(row.id, {
        name: row.name,
        category: row.category,
        address: row.address,
        isActive: row.is_active,
        isPartner: row.is_partner,
        logoUrl: row.logo_url ?? undefined,
        location: GeoPoint.create(row.latitude, row.longitude),
      }),
    }));
  }
}
