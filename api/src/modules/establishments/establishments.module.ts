import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { FindNearbyEstablishmentsUseCase } from './application/use-cases/find-nearby-establishments.use-case';
import { EstablishmentRepository } from './domain/repositories/establishment.repository';
import { InMemoryEstablishmentRepository } from './infrastructure/persistence/in-memory-establishment.repository';
import { PrismaEstablishmentRepository } from './infrastructure/persistence/prisma-establishment.repository';
import { EstablishmentsController } from './presentation/http/establishments.controller';

@Module({
  controllers: [EstablishmentsController],
  providers: [
    FindNearbyEstablishmentsUseCase,
    {
      // Inversión de dependencias: el caso de uso depende del puerto, aquí se elige el adaptador.
      provide: EstablishmentRepository,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) =>
        config.get<string>('DATABASE_URL')
          ? new PrismaEstablishmentRepository(prisma)
          : new InMemoryEstablishmentRepository(),
    },
  ],
})
export class EstablishmentsModule {}
