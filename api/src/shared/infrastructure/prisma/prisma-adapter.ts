import { PrismaPg } from '@prisma/adapter-pg';

/** Prisma 7 se conecta con el driver pg; sin DATABASE_URL la API usa repositorios en memoria y no consulta. */
export const prismaAdapter = () => new PrismaPg({ connectionString: process.env.DATABASE_URL });
