import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCsv } from './csv';
import { importCatalog } from './import-catalog';

/**
 * Carga del catálogo desde una carpeta con establecimientos.csv y productos.csv (H02.6).
 *   npm run catalog:import -- prisma/catalog/demo            (compilado, también en el contenedor)
 *   npm run catalog:import:dev -- ruta/a/la/carpeta           (desarrollo)
 * Usa DATABASE_URL y registra los cambios a nombre del primer administrador (o de CATALOG_IMPORT_USER_ID).
 */
async function main() {
  const folder = resolve(process.argv[2] ?? '');
  if (!process.argv[2]) throw new Error('Indique la carpeta con establecimientos.csv y productos.csv');
  const prisma = new PrismaClient();
  try {
    const report = await runImport(prisma, folder);
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

export async function runImport(prisma: PrismaClient, folder: string) {
  const read = (name: string) => parseCsv(readFileSync(join(folder, name), 'utf8'));
  const actorUserId = process.env.CATALOG_IMPORT_USER_ID ?? (await firstAdmin(prisma));
  if (!actorUserId) throw new Error('No hay administrador: defina SEED_ADMIN_* o CATALOG_IMPORT_USER_ID');
  return importCatalog(prisma, {
    establishments: read('establecimientos.csv'),
    products: read('productos.csv'),
    municipalityDaneCode: process.env.CATALOG_IMPORT_MUNICIPALITY ?? '86885',
    actorUserId,
  });
}

async function firstAdmin(prisma: PrismaClient): Promise<string | undefined> {
  const [admin] = await prisma.$queryRaw<{ user_id: string }[]>`
    SELECT user_id FROM v_active_user_roles WHERE role_code = 'ADMIN' ORDER BY granted_at LIMIT 1`;
  return admin?.user_id;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
