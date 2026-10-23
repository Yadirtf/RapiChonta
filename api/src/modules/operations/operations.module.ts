import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { BusinessConfigModule } from '../business-config/business-config.module';
import { FilesModule } from '../files/files.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeskUseCase } from './application/desk.use-cases';
import { REQUIRED_OPERATIONS_CODES } from './domain/operations.codes';
import { DeskActions, DeskReader } from './domain/ports/desk';
import { PrismaDeskActions } from './infrastructure/prisma-desk.actions';
import { PrismaDeskReader } from './infrastructure/prisma-desk.reader';
import { DeskController } from './presentation/http/desk.controller';
import { DeskPresenter } from './presentation/http/desk-presenter';

/** Al arrancar, verifica los códigos de catálogo de las novedades. */
@Injectable()
class OperationsCodesCheck implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    const missing: string[] = [];
    for (const [table, codes] of Object.entries(REQUIRED_OPERATIONS_CODES)) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`SELECT code FROM ${Prisma.raw(`"${table}"`)} WHERE code IN (${Prisma.join([...codes])})`;
      const found = new Set(rows.map((r) => r.code));
      missing.push(...codes.filter((c) => !found.has(c)).map((c) => `${table}.${c}`));
    }
    if (missing.length) throw new Error(`Faltan códigos de catálogo (ejecute la semilla): ${missing.join(', ')}`);
    new Logger('OperationsModule').log('Catálogos del panel de pedidos verificados');
  }
}

/**
 * Módulo `operations` (Docs/14-base-de-datos/E10, H10.5): el panel de pedidos del operador. Lista lo que está en curso
 * con sus alertas, muestra la línea de tiempo y resuelve: revisión de fotos de entrega, novedades y cancelación.
 */
@Module({
  imports: [BusinessConfigModule, NotificationsModule, FulfillmentModule, FilesModule],
  controllers: [DeskController],
  providers: [{ provide: DeskReader, useClass: PrismaDeskReader }, { provide: DeskActions, useClass: PrismaDeskActions }, DeskUseCase, DeskPresenter, OperationsCodesCheck],
})
export class OperationsModule {}
