import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { BusinessConfigModule } from '../business-config/business-config.module';
import { FilesModule } from '../files/files.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CourierAvailabilityUseCase, CourierOffersUseCase } from './application/courier.use-cases';
import { DispatchBoardUseCase, SendOfferUseCase } from './application/dispatch-board.use-cases';
import { DispatchSignal } from './application/dispatch-signal';
import { StaffActivityUseCase } from './application/staff-activity.use-cases';
import { REQUIRED_DISPATCH_CODES } from './domain/dispatch.codes';
import { DISPATCH_ORDER_STATUSES } from './domain/order-statuses';
import { CourierDesk } from './domain/ports/courier-desk';
import { DispatchBoard } from './domain/ports/dispatch-board';
import { DispatchMaintenance } from './domain/ports/dispatch-maintenance';
import { StaffActivityReader } from './domain/ports/staff-activity';
import { DispatchClock } from './infrastructure/dispatch-clock';
import { PrismaCourierDesk } from './infrastructure/prisma-courier-desk';
import { PrismaDispatchBoard } from './infrastructure/prisma-dispatch-board';
import { PrismaDispatchMaintenance } from './infrastructure/prisma-dispatch-maintenance';
import { PrismaStaffActivityReader } from './infrastructure/prisma-staff-activity.reader';
import { AuditController, CourierController, DispatchController } from './presentation/http/dispatch.controller';

/** Al arrancar, verifica los códigos de catálogo que usa el despacho. */
@Injectable()
class DispatchCodesCheck implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    const required = { ...REQUIRED_DISPATCH_CODES, order_statuses: Object.values(DISPATCH_ORDER_STATUSES) };
    const missing: string[] = [];
    for (const [table, codes] of Object.entries(required)) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`SELECT code FROM ${Prisma.raw(`"${table}"`)} WHERE code IN (${Prisma.join([...codes])})`;
      const found = new Set(rows.map((r) => r.code));
      missing.push(...codes.filter((c) => !found.has(c)).map((c) => `${table}.${c}`));
    }
    if (missing.length) throw new Error(`Faltan códigos de catálogo (ejecute la semilla): ${missing.join(', ')}`);
    new Logger('DispatchModule').log('Catálogos del despacho verificados');
  }
}

const seconds = (config: ConfigService, key: string, fallback: number) => {
  const value = Number(config.get<string>(key));
  return (Number.isFinite(value) && value > 0 ? value : fallback) * 1000;
};

/**
 * Módulo `dispatch` (Docs/14-base-de-datos/E07 y la parte de disponibilidad y ubicación de E08): la central
 * del operador, las respuestas del domiciliario, el vencimiento de ofertas y el registro del personal.
 */
@Module({
  imports: [BusinessConfigModule, NotificationsModule, FulfillmentModule, FilesModule],
  controllers: [DispatchController, CourierController, AuditController],
  providers: [
    { provide: DispatchBoard, useClass: PrismaDispatchBoard },
    { provide: CourierDesk, useClass: PrismaCourierDesk },
    { provide: DispatchMaintenance, useClass: PrismaDispatchMaintenance },
    { provide: StaffActivityReader, useClass: PrismaStaffActivityReader },
    {
      provide: DispatchClock,
      inject: [DispatchMaintenance, ConfigService],
      useFactory: (maintenance: DispatchMaintenance, config: ConfigService) =>
        new DispatchClock(maintenance, { idleMs: seconds(config, 'DISPATCH_IDLE_SWEEP_SECONDS', 300), graceMs: 250, minMs: 1_000 }),
    },
    { provide: DispatchSignal, useExisting: DispatchClock },
    DispatchCodesCheck,
    DispatchBoardUseCase,
    SendOfferUseCase,
    CourierAvailabilityUseCase,
    CourierOffersUseCase,
    StaffActivityUseCase,
  ],
})
export class DispatchModule {}
