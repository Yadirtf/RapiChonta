import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_MS = 60_000;

/**
 * Lee los parámetros del negocio vigentes (v_current_settings, E03). Se guardan en memoria un minuto:
 * un cambio desde el panel surte efecto sin reiniciar la API.
 */
@Injectable()
export class SettingsReader {
  private cache?: { at: number; values: Map<string, number> };

  constructor(private readonly prisma: PrismaService) {}

  async number(key: string, fallback: number): Promise<number> {
    const values = await this.load();
    return values.get(key) ?? fallback;
  }

  private async load(): Promise<Map<string, number>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.values;
    const rows = await this.prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value::text FROM v_current_settings WHERE municipality_id IS NULL`;
    const values = new Map(rows.map((row) => [row.key, Number(row.value)]));
    this.cache = { at: Date.now(), values };
    return values;
  }
}
