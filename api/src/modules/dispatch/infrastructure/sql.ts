import { Prisma } from '../../../generated/prisma/client';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';

/** Un error de la base dentro de $queryRaw llega con el SQLSTATE y el nombre de la restricción en el texto. */
export const dbError = (error: unknown, sqlState: string, needle?: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.message.includes(sqlState) && (!needle || error.message.includes(needle));

export const point = (lat: number, lng: number) => GeoPoint.create(lat, lng);

export const name = (givenNames: string, familyNames: string | null) => ({ givenNames, familyNames });
