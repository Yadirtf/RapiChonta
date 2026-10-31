import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { FilesModule } from '../files/files.module';
import { ManageCategoriesUseCase } from './application/admin/categories.use-cases';
import {
  ChangeEstablishmentStatusUseCase,
  CreateEstablishmentUseCase,
  EstablishmentValidator,
  GetEstablishmentAdminUseCase,
  ListEstablishmentsUseCase,
  UpdateEstablishmentUseCase,
} from './application/admin/establishments.use-cases';
import { GetMenuAdminUseCase, ManageProductImagesUseCase, ManageProductsUseCase, ManageSectionsUseCase, MenuAccess } from './application/admin/menu.use-cases';
import { FindNearbyEstablishmentsUseCase } from './application/public/find-nearby-establishments.use-case';
import { GetEstablishmentUseCase } from './application/public/get-establishment.use-case';
import { REQUIRED_CATALOG_CODES } from './domain/catalog.codes';
import { CategoryRepository } from './domain/ports/category.repository';
import { EstablishmentAdminRepository } from './domain/ports/establishment-admin.repository';
import { MenuRepository } from './domain/ports/menu.repository';
import { PublicCatalogRepository } from './domain/ports/public-catalog.repository';
import { PrismaCategoryRepository } from './infrastructure/persistence/prisma-category.repository';
import { PrismaEstablishmentAdminRepository } from './infrastructure/persistence/prisma-establishment-admin.repository';
import { PrismaMenuRepository } from './infrastructure/persistence/prisma-menu.repository';
import { PrismaPublicCatalogRepository } from './infrastructure/persistence/prisma-public-catalog.repository';
import { AdminCatalogController, AdminMenuController } from './presentation/http/admin-catalog.controller';
import { CatalogPresenter } from './presentation/http/catalog-presenter';
import { PublicCatalogController } from './presentation/http/public-catalog.controller';

/** Al arrancar, verifica que existan los códigos de catálogo que este módulo usa. */
@Injectable()
class CatalogCodesCheck implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    const missing: string[] = [];
    for (const [table, codes] of Object.entries(REQUIRED_CATALOG_CODES)) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`SELECT code FROM ${Prisma.raw(`"${table}"`)} WHERE code IN (${Prisma.join([...codes])})`;
      const found = new Set(rows.map((r) => r.code));
      missing.push(...codes.filter((c) => !found.has(c)).map((c) => `${table}.${c}`));
    }
    if (missing.length) throw new Error(`Faltan códigos de catálogo (ejecute la semilla): ${missing.join(', ')}`);
    new Logger('CatalogModule').log('Catálogos de establecimientos verificados');
  }
}

/** Módulo `catalog` (Docs/14-base-de-datos/E02): establecimientos, categorías, menú y productos versionados. */
@Module({
  imports: [FilesModule],
  controllers: [PublicCatalogController, AdminCatalogController, AdminMenuController],
  providers: [
    { provide: PublicCatalogRepository, useClass: PrismaPublicCatalogRepository },
    { provide: EstablishmentAdminRepository, useClass: PrismaEstablishmentAdminRepository },
    { provide: MenuRepository, useClass: PrismaMenuRepository },
    { provide: CategoryRepository, useClass: PrismaCategoryRepository },
    CatalogCodesCheck,
    CatalogPresenter,
    FindNearbyEstablishmentsUseCase,
    GetEstablishmentUseCase,
    EstablishmentValidator,
    ListEstablishmentsUseCase,
    GetEstablishmentAdminUseCase,
    CreateEstablishmentUseCase,
    UpdateEstablishmentUseCase,
    ChangeEstablishmentStatusUseCase,
    MenuAccess,
    GetMenuAdminUseCase,
    ManageSectionsUseCase,
    ManageProductsUseCase,
    ManageProductImagesUseCase,
    ManageCategoriesUseCase,
  ],
})
export class CatalogModule {}
