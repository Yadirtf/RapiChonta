import { Global, Module } from '@nestjs/common';
import { SettingsReader } from '../settings/settings.reader';
import { CatalogIds } from './catalog-ids';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, CatalogIds, SettingsReader],
  exports: [PrismaService, CatalogIds, SettingsReader],
})
export class PrismaModule {}
