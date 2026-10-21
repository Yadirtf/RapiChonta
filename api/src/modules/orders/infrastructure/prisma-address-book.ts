import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { AddressBook, NewAddress, RecipientBook, SavedAddress, SavedRecipient } from '../domain/ports/address-book';
import { ADDRESS_COLUMNS, AddressRow, insertAddress, toAddress } from './address-sql';

@Injectable()
export class PrismaAddressBook extends AddressBook {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(ownerUserId: string): Promise<SavedAddress[]> {
    const rows = await this.prisma.$queryRaw<AddressRow[]>`
      SELECT ${ADDRESS_COLUMNS} FROM addresses a
      WHERE a.owner_user_id = ${ownerUserId}::uuid AND a.archived_at IS NULL AND a.label IS NOT NULL
      ORDER BY a.is_default DESC, a.created_at DESC`;
    return rows.map(toAddress);
  }

  /** También las de un solo uso: "repetir pedido" puede volver a usar la ubicación de un pedido anterior. */
  async find(ownerUserId: string, id: string): Promise<SavedAddress | null> {
    const [row] = await this.prisma.$queryRaw<AddressRow[]>`
      SELECT ${ADDRESS_COLUMNS} FROM addresses a WHERE a.id = ${id}::uuid AND a.owner_user_id = ${ownerUserId}::uuid AND a.archived_at IS NULL`;
    return row ? toAddress(row) : null;
  }

  async create(ownerUserId: string, data: NewAddress): Promise<SavedAddress> {
    return this.prisma.$transaction(async (tx) => toAddress(await insertAddress(tx, ownerUserId, data)));
  }

  async archive(ownerUserId: string, id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const [archived] = await tx.$queryRaw<{ was_default: boolean }[]>`
        WITH old AS (
          SELECT id, is_default FROM addresses
          WHERE id = ${id}::uuid AND owner_user_id = ${ownerUserId}::uuid AND archived_at IS NULL AND label IS NOT NULL
        )
        UPDATE addresses a SET archived_at = now(), is_default = false FROM old WHERE a.id = old.id
        RETURNING old.is_default AS was_default`;
      if (!archived) return false;
      // Si se archivó la predeterminada, la más reciente toma su lugar.
      if (archived.was_default) {
        await tx.$executeRaw`
          UPDATE addresses SET is_default = true WHERE id = (
            SELECT id FROM addresses WHERE owner_user_id = ${ownerUserId}::uuid AND archived_at IS NULL AND label IS NOT NULL
            ORDER BY created_at DESC LIMIT 1)`;
      }
      return true;
    });
  }

  async setDefault(ownerUserId: string, id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM addresses WHERE id = ${id}::uuid AND owner_user_id = ${ownerUserId}::uuid AND archived_at IS NULL AND label IS NOT NULL FOR UPDATE`;
      if (!target.length) return false;
      await tx.$executeRaw`UPDATE addresses SET is_default = false WHERE owner_user_id = ${ownerUserId}::uuid AND is_default AND id <> ${id}::uuid`;
      await tx.$executeRaw`UPDATE addresses SET is_default = true WHERE id = ${id}::uuid`;
      return true;
    });
  }
}

@Injectable()
export class PrismaRecipientBook extends RecipientBook {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(ownerUserId: string): Promise<SavedRecipient[]> {
    const rows = await this.prisma.customerRecipient.findMany({
      where: { ownerUserId, archivedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => ({ id: r.id, fullName: r.fullName, phoneE164: r.phoneE164!, createdAt: r.createdAt }));
  }

  async find(ownerUserId: string, id: string): Promise<SavedRecipient | null> {
    const r = await this.prisma.customerRecipient.findFirst({ where: { id, ownerUserId, archivedAt: null } });
    return r ? { id: r.id, fullName: r.fullName, phoneE164: r.phoneE164!, createdAt: r.createdAt } : null;
  }

  async archive(ownerUserId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.customerRecipient.updateMany({ where: { id, ownerUserId, archivedAt: null }, data: { archivedAt: new Date() } });
    return count === 1;
  }
}
