import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { ExchangeRatesUseCase } from './application/exchange-rates.use-cases';
import { MunicipalityScope } from './application/municipality-scope';
import { EnsureOpenForOrders, GetBusinessStatusUseCase, ManageScheduleUseCase, OpeningHours } from './application/schedule.use-cases';
import { ManageCommissionUseCase, ManageSettingsUseCase } from './application/settings.use-cases';
import { ManageZonesUseCase, QuoteDeliveryUseCase } from './application/zones.use-cases';
import { REQUIRED_BUSINESS_CODES } from './domain/business-config.codes';
import { ExchangeRateProvider, ExchangeRatesRepository } from './domain/ports/exchange-rates';
import { MunicipalityDirectory } from './domain/ports/municipalities';
import { ScheduleRepository } from './domain/ports/schedule.repository';
import { SettingsRepository } from './domain/ports/settings.repository';
import { ZonesRepository } from './domain/ports/zones.repository';
import { ExchangeRatesScheduler } from './infrastructure/exchange-rates.scheduler';
import { HttpExchangeRateProvider } from './infrastructure/http-exchange-rate.provider';
import { PrismaExchangeRatesRepository } from './infrastructure/prisma-exchange-rates.repository';
import { PrismaMunicipalityDirectory } from './infrastructure/prisma-municipalities';
import { PrismaScheduleRepository } from './infrastructure/prisma-schedule.repository';
import { PrismaSettingsRepository } from './infrastructure/prisma-settings.repository';
import { PrismaZonesRepository } from './infrastructure/prisma-zones.repository';
import { AdminBusinessController } from './presentation/http/admin-business.controller';
import { PublicBusinessController } from './presentation/http/public-business.controller';

/** Al arrancar, verifica que existan los códigos de catálogo que este módulo usa. */
@Injectable()
class BusinessCodesCheck implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    const missing: string[] = [];
    for (const [table, codes] of Object.entries(REQUIRED_BUSINESS_CODES)) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`SELECT code FROM ${Prisma.raw(`"${table}"`)} WHERE code IN (${Prisma.join([...codes])})`;
      const found = new Set(rows.map((r) => r.code));
      missing.push(...codes.filter((c) => !found.has(c)).map((c) => `${table}.${c}`));
    }
    if (missing.length) throw new Error(`Faltan códigos de catálogo (ejecute la semilla): ${missing.join(', ')}`);
    new Logger('BusinessConfigModule').log('Catálogos de zonas, horario y parámetros verificados');
  }
}

/**
 * Módulo `business-config` (Docs/14-base-de-datos/E03): zonas con tarifa, horario, parámetros, comisión y
 * tasas de cambio. Exporta lo que necesita el pedido (E04): la tarifa de un punto y la regla de horario.
 */
@Module({
  controllers: [PublicBusinessController, AdminBusinessController],
  providers: [
    { provide: MunicipalityDirectory, useClass: PrismaMunicipalityDirectory },
    { provide: ZonesRepository, useClass: PrismaZonesRepository },
    { provide: ScheduleRepository, useClass: PrismaScheduleRepository },
    { provide: SettingsRepository, useClass: PrismaSettingsRepository },
    { provide: ExchangeRatesRepository, useClass: PrismaExchangeRatesRepository },
    { provide: ExchangeRateProvider, useClass: HttpExchangeRateProvider },
    BusinessCodesCheck,
    MunicipalityScope,
    ManageZonesUseCase,
    QuoteDeliveryUseCase,
    OpeningHours,
    ManageScheduleUseCase,
    GetBusinessStatusUseCase,
    EnsureOpenForOrders,
    ManageSettingsUseCase,
    ManageCommissionUseCase,
    ExchangeRatesUseCase,
    ExchangeRatesScheduler,
  ],
  exports: [QuoteDeliveryUseCase, EnsureOpenForOrders],
})
export class BusinessConfigModule {}
