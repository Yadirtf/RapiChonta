import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

type Client = Prisma.TransactionClient | PrismaService;

/**
 * Traduce `code` → `id` de las tablas catálogo, con caché en memoria (los ids de un código nunca cambian).
 * El código del programa siempre habla en `code`; los ids solo existen en la capa de persistencia.
 */
@Injectable()
export class CatalogIds {
  private readonly cache = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async of(table: string, code: string, client: Client = this.prisma): Promise<number> {
    const key = `${table}:${code}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const rows = await client.$queryRaw<{ id: number }[]>`
      SELECT id FROM ${Prisma.raw(`"${table.replace(/"/g, '')}"`)} WHERE code = ${code} AND deactivated_at IS NULL`;
    if (!rows.length) throw new Error(`Código ${code} no existe o está dado de baja en ${table}`);
    this.cache.set(key, Number(rows[0].id));
    return Number(rows[0].id);
  }
}
