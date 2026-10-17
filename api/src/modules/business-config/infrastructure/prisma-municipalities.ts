import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { MunicipalityDirectory, MunicipalityInfo } from '../domain/ports/municipalities';

interface Row {
  id: number;
  name: string;
  time_zone: string;
  lat: number;
  lng: number;
  launched: boolean;
}

const toInfo = (r: Row): MunicipalityInfo => ({ id: r.id, name: r.name, timeZone: r.time_zone, center: { lat: r.lat, lng: r.lng }, launched: r.launched });

@Injectable()
export class PrismaMunicipalityDirectory extends MunicipalityDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(scope: number | null): Promise<MunicipalityInfo[]> {
    const where = scope === null ? Prisma.empty : Prisma.sql`WHERE id = ${scope}`;
    return (await this.prisma.$queryRaw<Row[]>`${this.select()} ${where} ORDER BY name`).map(toInfo);
  }

  async find(id: number): Promise<MunicipalityInfo | null> {
    const [row] = await this.prisma.$queryRaw<Row[]>`${this.select()} WHERE id = ${id}`;
    return row ? toInfo(row) : null;
  }

  private select() {
    return Prisma.sql`
      SELECT id, name, time_zone, ST_Y(center::geometry) AS lat, ST_X(center::geometry) AS lng,
             coalesce(launched_at <= now(), false) AS launched
      FROM municipalities`;
  }
}
