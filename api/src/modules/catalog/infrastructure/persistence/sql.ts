import { Prisma } from '@prisma/client';
import { GeoPoint } from '../../domain/value-objects/geo-point';
import { GeoPolygon } from '../../domain/value-objects/geo-polygon';

/** Fragmentos SQL de PostGIS (siempre parametrizados). */
export const pointSql = (p: GeoPoint) => Prisma.sql`ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography`;
export const polygonSql = (area: GeoPolygon) => Prisma.sql`ST_GeogFromText(${`SRID=4326;${area.toWkt()}`})`;

/** Texto de búsqueda para ILIKE sin comodines del usuario. */
export const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
