import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../../generated/prisma/client';
import { prismaAdapter } from './prisma-adapter';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ adapter: prismaAdapter() });
  }

  async onModuleInit(): Promise<void> {
    // Sin DATABASE_URL la API arranca con repositorios en memoria (desarrollo local).
    if (!process.env.DATABASE_URL) {
      this.logger.warn('DATABASE_URL no definida: se usan repositorios en memoria');
      return;
    }
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
