import { Prisma } from '@prisma/client';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { pointSql } from '../../catalog/infrastructure/persistence/sql';
import { NewAddress, SavedAddress } from '../domain/ports/address-book';

type Tx = Prisma.TransactionClient;

export interface AddressRow {
  id: string;
  label: string | null;
  line: string | null;
  reference: string | null;
  latitude: number;
  longitude: number;
  is_default: boolean;
  created_at: Date;
}

export const ADDRESS_COLUMNS = Prisma.sql`a.id, a.label, a.line, a.reference, ST_Y(a.location::geometry) AS latitude,
  ST_X(a.location::geometry) AS longitude, a.is_default, a.created_at`;

export const toAddress = (row: AddressRow): SavedAddress => ({
  id: row.id,
  label: row.label,
  line: row.line,
  reference: row.reference,
  location: GeoPoint.create(row.latitude, row.longitude),
  isDefault: row.is_default,
  createdAt: row.created_at,
});

/**
 * Inserta una dirección. Con nombre: reemplaza la vigente del mismo nombre ("Casa" se mudó) y hereda si era
 * la predeterminada; la primera con nombre queda predeterminada. Sin nombre: de un solo uso, fuera de la lista.
 * Bloquea al dueño para que dos guardados simultáneos no dejen dos predeterminadas.
 */
export async function insertAddress(tx: Tx, ownerUserId: string, data: NewAddress): Promise<AddressRow> {
  let makeDefault = false;
  if (data.label) {
    await tx.$executeRaw`SELECT 1 FROM users WHERE id = ${ownerUserId}::uuid FOR UPDATE`;
    const replaced = await tx.$queryRaw<{ is_default: boolean }[]>`
      WITH old AS (
        SELECT id, is_default FROM addresses
        WHERE owner_user_id = ${ownerUserId}::uuid AND archived_at IS NULL AND label IS NOT NULL AND lower(label) = lower(${data.label})
      )
      UPDATE addresses a SET archived_at = now(), is_default = false FROM old WHERE a.id = old.id
      RETURNING old.is_default`;
    const [{ has_default }] = await tx.$queryRaw<{ has_default: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM addresses WHERE owner_user_id = ${ownerUserId}::uuid AND is_default AND archived_at IS NULL) AS has_default`;
    makeDefault = replaced.some((r) => r.is_default) || !has_default;
  }
  const [row] = await tx.$queryRaw<AddressRow[]>`
    INSERT INTO addresses AS a (owner_user_id, label, line, reference, location, is_default)
    VALUES (${ownerUserId}::uuid, ${data.label}, ${data.line}, ${data.reference}, ${pointSql(data.location)}, ${makeDefault})
    RETURNING ${ADDRESS_COLUMNS}`;
  return row;
}
