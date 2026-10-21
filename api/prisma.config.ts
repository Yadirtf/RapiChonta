import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 ya no lee .env por su cuenta: en local se carga aquí; en CI y en el contenedor
// DATABASE_URL llega como variable de entorno. `prisma generate` no la necesita.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
