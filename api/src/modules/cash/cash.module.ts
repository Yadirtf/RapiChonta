import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { BusinessConfigModule } from '../business-config/business-config.module';
import { CashBoxesUseCase } from './application/cash-boxes.use-cases';
import { CourierCashUseCase } from './application/courier-cash.use-case';
import { REQUIRED_CASH_CODES } from './domain/cash.codes';
import { CashBook, CashBoxReader } from './domain/ports/cash-boxes';
import { PrismaCashBook } from './infrastructure/prisma-cash-book';
import { PrismaCashBoxReader } from './infrastructure/prisma-cash-box.reader';
import { CashBoxesController, CourierCashController } from './presentation/http/cash.controller';
import { CashPresenter } from './presentation/http/cash-presenter';

/** Al arrancar, verifica los tipos de movimiento que escribe este módulo. */
@Injectable()
class CashCodesCheck implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    const missing: string[] = [];
    for (const [table, codes] of Object.entries(REQUIRED_CASH_CODES)) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`SELECT code FROM ${Prisma.raw(`"${table}"`)} WHERE code IN (${Prisma.join([...codes])})`;
      const found = new Set(rows.map((r) => r.code));
      missing.push(...codes.filter((c) => !found.has(c)).map((c) => `${table}.${c}`));
    }
    if (missing.length) throw new Error(`Faltan códigos de catálogo (ejecute la semilla): ${missing.join(', ')}`);
    new Logger('CashModule').log('Catálogos de caja verificados');
  }
}

/**
 * Módulo `cash` (Docs/14-base-de-datos/E11, H11.1–H11.4): la caja diaria de cada domiciliario. Abre la base, firma
 * ajustes, cierra con lo entregado y muestra a cada domiciliario la suya. La compra y el cobro los escribe fulfillment.
 */
@Module({
  imports: [BusinessConfigModule],
  controllers: [CashBoxesController, CourierCashController],
  providers: [{ provide: CashBoxReader, useClass: PrismaCashBoxReader }, { provide: CashBook, useClass: PrismaCashBook }, CashBoxesUseCase, CourierCashUseCase, CashPresenter, CashCodesCheck],
})
export class CashModule {}
