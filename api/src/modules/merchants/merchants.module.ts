import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { FilesModule } from '../files/files.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MerchantPortalUseCase } from './application/merchant-portal.use-cases';
import { ManagePartnershipsUseCase } from './application/partnerships.use-cases';
import { REQUIRED_MERCHANT_CODES } from './domain/merchants.codes';
import { MerchantDesk } from './domain/ports/merchant-desk';
import { Partnerships } from './domain/ports/partnerships';
import { PrismaMerchantDesk } from './infrastructure/prisma-merchant-desk';
import { PrismaPartnerships } from './infrastructure/prisma-partnerships';
import { MerchantPortalController } from './presentation/http/merchant-portal.controller';
import { MerchantsPresenter } from './presentation/http/merchants-presenter';
import { PartnershipsController } from './presentation/http/partnerships.controller';

/** Al arrancar, verifica los códigos de catálogo del comercio aliado. */
@Injectable()
class MerchantsCodesCheck implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    const missing: string[] = [];
    for (const [table, codes] of Object.entries(REQUIRED_MERCHANT_CODES)) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`SELECT code FROM ${Prisma.raw(`"${table}"`)} WHERE code IN (${Prisma.join([...codes])})`;
      const found = new Set(rows.map((r) => r.code));
      missing.push(...codes.filter((c) => !found.has(c)).map((c) => `${table}.${c}`));
    }
    if (missing.length) throw new Error(`Faltan códigos de catálogo (ejecute la semilla): ${missing.join(', ')}`);
    new Logger('MerchantsModule').log('Catálogos del comercio aliado verificados');
  }
}

/**
 * Módulo `merchants` (E15, Docs/14-base-de-datos/E13-E15-fases-futuras.md): el comercio aliado. El portal donde el
 * comercio recibe sus pedidos directos y los convenios que el administrador firma desde el panel. Su menú lo edita con
 * los mismos endpoints del panel (catalog/AdminMenuController), con el alcance de sus locales.
 */
@Module({
  imports: [IdentityModule, NotificationsModule, FilesModule],
  controllers: [MerchantPortalController, PartnershipsController],
  providers: [
    { provide: MerchantDesk, useClass: PrismaMerchantDesk },
    { provide: Partnerships, useClass: PrismaPartnerships },
    MerchantPortalUseCase,
    ManagePartnershipsUseCase,
    MerchantsPresenter,
    MerchantsCodesCheck,
  ],
})
export class MerchantsModule {}
