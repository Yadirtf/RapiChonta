import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { raw } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DomainErrorFilter } from './shared/infrastructure/domain-error.filter';
import { PrismaErrorFilter } from './shared/infrastructure/prisma-error.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás de proxies (balanceador y, en el contenedor único, la web) la IP real viene en X-Forwarded-For.
  // TRUST_PROXY = número de proxies de confianza; sin él, el límite por IP vería solo la IP del proxy.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

  app.use(helmet());
  // La cookie de refresco de la web (HttpOnly, SameSite=Strict) se lee en /api/v1/auth/refresh.
  app.use(cookieParser());
  // Bytes de las fotos en el modo FILE_STORAGE=database (PUT a la URL firmada). Solo esa ruta y con tope.
  app.use('/api/v1/files/uploads', raw({ type: (req) => req.method === 'PUT', limit: '12mb' }));
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001').split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaErrorFilter(), new DomainErrorFilter());
  app.enableShutdownHooks();

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
