import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Notifier } from '../notifications/application/notifier';
import { CourierTripUseCase, GeofenceUseCase } from './application/courier-trip.use-cases';
import { PreparationSignal } from './application/preparation-signal';
import { REQUIRED_FULFILLMENT_CODES } from './domain/fulfillment.codes';
import { CourierTrips, GeofenceProbe, PreparationWatch } from './domain/ports/courier-trips';
import { PrismaCourierTrips } from './infrastructure/prisma-courier-trips';
import { PrismaGeofenceProbe } from './infrastructure/prisma-geofence.probe';
import { PrismaPreparationWatch } from './infrastructure/prisma-preparation.watch';
import { PreparationClock } from './infrastructure/preparation-clock';
import { CourierTripController } from './presentation/http/fulfillment.controller';
import { FulfillmentPresenter } from './presentation/http/fulfillment-presenter';

/** Al arrancar, verifica los códigos de catálogo que usa el pedido en curso. */
@Injectable()
class FulfillmentCodesCheck implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    const missing: string[] = [];
    for (const [table, codes] of Object.entries(REQUIRED_FULFILLMENT_CODES)) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`SELECT code FROM ${Prisma.raw(`"${table}"`)} WHERE code IN (${Prisma.join([...codes])})`;
      const found = new Set(rows.map((r) => r.code));
      missing.push(...codes.filter((c) => !found.has(c)).map((c) => `${table}.${c}`));
    }
    if (missing.length) throw new Error(`Faltan códigos de catálogo (ejecute la semilla): ${missing.join(', ')}`);
    new Logger('FulfillmentModule').log('Catálogos del pedido en curso verificados');
  }
}

const seconds = (config: ConfigService, key: string, fallback: number) => {
  const value = Number(config.get<string>(key));
  return (Number.isFinite(value) && value > 0 ? value : fallback) * 1000;
};

/**
 * Módulo `fulfillment` (Docs/14-base-de-datos/E08): lo que pasa después de que el domiciliario toma el pedido.
 * Geocercas (llegada al local y donde el cliente), compra con factura, preparación y la cola sin señal.
 * E09 (producto faltante) y E10 (entrega) se suman aquí.
 */
@Module({
  imports: [FilesModule, NotificationsModule],
  controllers: [CourierTripController],
  providers: [
    { provide: CourierTrips, useClass: PrismaCourierTrips },
    { provide: GeofenceProbe, useClass: PrismaGeofenceProbe },
    { provide: PreparationWatch, useClass: PrismaPreparationWatch },
    {
      provide: PreparationClock,
      inject: [PreparationWatch, Notifier, ConfigService],
      useFactory: (watch: PreparationWatch, notifier: Notifier, config: ConfigService) =>
        new PreparationClock(watch, notifier, { idleMs: seconds(config, 'PREPARATION_IDLE_SWEEP_SECONDS', 300), minMs: 1_000 }),
    },
    { provide: PreparationSignal, useExisting: PreparationClock },
    FulfillmentCodesCheck,
    FulfillmentPresenter,
    CourierTripUseCase,
    GeofenceUseCase,
  ],
  exports: [GeofenceUseCase],
})
export class FulfillmentModule {}
