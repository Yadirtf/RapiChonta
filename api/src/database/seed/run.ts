import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { join } from 'node:path';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import {
  CATALOGS,
  CATEGORY_NAMES,
  GEOGRAPHY,
  INITIAL_LEGAL_VERSION,
  LEGAL_REQUIREMENTS,
  ROLE_PERMISSIONS,
  SETTINGS,
  TRANSITIONS,
} from './catalogs';
import { runImport } from '../catalog-import/run';

/**
 * Semilla idempotente: se ejecuta en cada arranque del contenedor.
 * - Siempre: catálogos del sistema, geografía del piloto y parámetros iniciales.
 * - Con SEED_ADMIN_PHONE + SEED_ADMIN_PASSWORD: el primer administrador (solo si el número no existe).
 * - Con SEED_DEMO_DATA=true: establecimientos de ejemplo con menú (prisma/catalog/demo), sin duplicar.
 */
const prisma = new PrismaClient();
const id = (name: string) => Prisma.raw(`"${name.replace(/"/g, '')}"`);

async function upsertCatalog(table: string, key: string, rows: Record<string, unknown>[], insertOnly = false) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const updates = columns.filter((c) => c !== key);
    const onConflict = insertOnly
      ? Prisma.sql`DO NOTHING`
      : Prisma.sql`DO UPDATE SET ${Prisma.join(updates.map((c) => Prisma.sql`${id(c)} = EXCLUDED.${id(c)}`))}`;
    await prisma.$executeRaw`
      INSERT INTO ${id(table)} (${Prisma.join(columns.map(id))})
      VALUES (${Prisma.join(columns.map((c) => row[c]))})
      ON CONFLICT (${id(key)}) ${onConflict}
    `;
  }
}

async function seedCatalogs() {
  for (const catalog of CATALOGS) await upsertCatalog(catalog.table, catalog.key, catalog.rows, catalog.insertOnly);

  for (const { table, catalog, pairs } of TRANSITIONS) {
    for (const [from, to] of pairs) {
      await prisma.$executeRaw`
        INSERT INTO ${id(table)} (from_status_id, to_status_id)
        SELECT f.id, t.id FROM ${id(catalog)} f, ${id(catalog)} t WHERE f.code = ${from} AND t.code = ${to}
        ON CONFLICT DO NOTHING
      `;
    }
  }

  const permissions = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];
  await upsertCatalog(
    'permissions',
    'code',
    permissions.map((code, index) => ({ code, module: code.split('.')[0], sort_order: index + 1 })),
  );
  for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
    await prisma.$executeRaw`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = ${role} AND p.code IN (${Prisma.join(codes)})
      ON CONFLICT DO NOTHING
    `;
  }

  for (const [role, documents] of Object.entries(LEGAL_REQUIREMENTS)) {
    await prisma.$executeRaw`
      INSERT INTO legal_document_requirements (legal_document_type_id, role_id)
      SELECT t.id, r.id FROM legal_document_types t, roles r WHERE r.code = ${role} AND t.code IN (${Prisma.join(documents)})
      ON CONFLICT DO NOTHING
    `;
  }
  // Primera versión de cada documento: solo si el tipo aún no tiene ninguna.
  await prisma.$executeRaw`
    INSERT INTO legal_document_versions (legal_document_type_id, version_label, published_at)
    SELECT t.id, ${INITIAL_LEGAL_VERSION}, now() FROM legal_document_types t
    WHERE NOT EXISTS (SELECT 1 FROM legal_document_versions v WHERE v.legal_document_type_id = t.id)
  `;

  for (const [code, names] of Object.entries(CATEGORY_NAMES)) {
    for (const [language, name] of Object.entries(names)) {
      await prisma.$executeRaw`
        INSERT INTO establishment_category_translations (category_id, language_id, name)
        SELECT c.id, l.id, ${name} FROM establishment_categories c, languages l WHERE c.code = ${code} AND l.code = ${language}
        ON CONFLICT (category_id, language_id) DO NOTHING
      `;
    }
  }
}

async function seedGeography() {
  const { country, department, municipality: m } = GEOGRAPHY;
  await prisma.$executeRaw`
    INSERT INTO countries (iso2, name) VALUES (${country.iso2}, ${country.name})
    ON CONFLICT (iso2) DO UPDATE SET name = EXCLUDED.name
  `;
  await prisma.$executeRaw`
    INSERT INTO departments (country_id, dane_code, name)
    SELECT id, ${department.daneCode}, ${department.name} FROM countries WHERE iso2 = ${country.iso2}
    ON CONFLICT (dane_code) DO UPDATE SET name = EXCLUDED.name
  `;
  await prisma.$executeRaw`
    INSERT INTO municipalities (department_id, dane_code, name, time_zone, center, launched_at)
    SELECT id, ${m.daneCode}, ${m.name}, ${m.timeZone},
           ST_SetSRID(ST_MakePoint(${m.center.lng}, ${m.center.lat}), 4326)::geography, ${m.launchedAt}::timestamptz
    FROM departments WHERE dane_code = ${department.daneCode}
    ON CONFLICT (dane_code) DO NOTHING
  `;
}

async function seedSettings() {
  for (const s of SETTINGS) {
    await prisma.$executeRaw`
      INSERT INTO setting_definitions (key, data_type_id, min_value, max_value, is_scoped_by_municipality)
      SELECT ${s.key}, id, ${s.min ?? null}, ${s.max ?? null}, ${s.scoped} FROM setting_data_types WHERE code = ${s.type}
      ON CONFLICT (key) DO UPDATE SET data_type_id = EXCLUDED.data_type_id, min_value = EXCLUDED.min_value,
        max_value = EXCLUDED.max_value, is_scoped_by_municipality = EXCLUDED.is_scoped_by_municipality
    `;
    // Los valores son versiones inmutables: solo se inserta el inicial si la clave no tiene ninguno.
    await prisma.$executeRaw`
      INSERT INTO setting_values (setting_definition_id, value)
      SELECT d.id, ${s.value} FROM setting_definitions d
      WHERE d.key = ${s.key} AND NOT EXISTS (SELECT 1 FROM setting_values v WHERE v.setting_definition_id = d.id)
    `;
  }
}

/** Primer administrador. Después, el administrador crea al resto del personal desde el panel. */
async function seedAdmin() {
  const rawPhone = process.env.SEED_ADMIN_PHONE;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!rawPhone || !password) return;

  const phone = parsePhoneNumberFromString(rawPhone, 'CO');
  if (!phone?.isValid()) throw new Error('SEED_ADMIN_PHONE no es un número válido');
  if (password.length < 10) throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 10 caracteres');
  const e164 = phone.number;

  const existing = await prisma.personPhone.findUnique({ where: { phoneE164: e164 } });
  if (existing) return;

  const [givenNames, ...rest] = (process.env.SEED_ADMIN_NAME ?? 'Administrador').trim().split(/\s+/);
  const passwordHash = await hash(password, { type: 2 });

  await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { givenNames, familyNames: rest.join(' ') || null } });
    await tx.personPhone.create({ data: { personId: person.id, phoneE164: e164, isPrimary: true, verifiedAt: new Date() } });
    const active = await tx.userStatus.findUniqueOrThrow({ where: { code: 'ACTIVE' } });
    const user = await tx.user.create({
      data: { personId: person.id, statusId: active.id, passwordHash, passwordChangedAt: new Date() },
    });
    await tx.userStatusHistory.create({ data: { userId: user.id, toStatusId: active.id, reason: 'SEED_ADMIN' } });
    const roles = await tx.role.findMany({ where: { code: { in: ['ADMIN', 'CUSTOMER'] } } });
    await tx.userRole.createMany({ data: roles.map((role) => ({ userId: user.id, roleId: role.id })) });
    const es = await tx.language.findUniqueOrThrow({ where: { code: 'es' } });
    await tx.userPreference.create({ data: { userId: user.id, languageId: es.id } });
  });
  console.log(`Administrador inicial creado (${e164.slice(0, 4)}…${e164.slice(-2)})`);
}

/** Catálogo de ejemplo (locales "Demo" con menú) para probar el mapa y la ficha. Usa la misma carga que H02.6. */
async function seedDemoData() {
  if (process.env.SEED_DEMO_DATA !== 'true') return;
  try {
    const report = await runImport(prisma, join(__dirname, '../../../prisma/catalog/demo'));
    const { establishments: e, products: p } = report;
    console.log(`Datos de ejemplo: ${e.created} locales nuevos, ${e.updated} actualizados; ${p.created} productos nuevos, ${p.newVersions} con versión nueva`);
    report.errors.forEach((error) => console.warn(`Datos de ejemplo: ${error}`));
  } catch (error) {
    console.warn(`Datos de ejemplo omitidos: ${error instanceof Error ? error.message : error}`);
  }
}

async function main() {
  await seedCatalogs();
  await seedGeography();
  await seedSettings();
  await seedAdmin();
  await seedDemoData();
  console.log('Semilla aplicada');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
