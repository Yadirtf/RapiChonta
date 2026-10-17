import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Reglas de E02 que garantiza PostgreSQL (Docs/14-base-de-datos/E02-establecimientos-y-menus.md).
 * Requieren una base migrada y con la semilla: `npm run prisma:deploy && npm run seed:dev && npm run test:db`.
 */
const prisma = new PrismaClient();
class Rollback extends Error {}

async function inTransaction(work: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await work(tx);
    throw new Rollback();
  }, { timeout: 30_000 }).catch((error) => {
    if (!(error instanceof Rollback)) throw error;
  });
}

async function expectDbError(tx: Prisma.TransactionClient, work: () => Promise<unknown>, pattern: RegExp) {
  await tx.$executeRaw`SAVEPOINT expect_error`;
  await expect(work()).rejects.toThrow(pattern);
  await tx.$executeRaw`ROLLBACK TO SAVEPOINT expect_error`;
}

const SQUARE = (lng: number, lat: number, d = 0.0002) =>
  `SRID=4326;POLYGON((${lng - d} ${lat - d}, ${lng + d} ${lat - d}, ${lng + d} ${lat + d}, ${lng - d} ${lat + d}, ${lng - d} ${lat - d}))`;

async function newEstablishment(tx: Prisma.TransactionClient, name: string, status = 'ACTIVE', lng = -76.61, lat = 1.03) {
  const [admin] = await tx.$queryRaw<{ id: string }[]>`SELECT u.id FROM users u LIMIT 1`;
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO establishments (municipality_id, name, address_line, location, area, status_id, created_by_user_id)
    SELECT m.id, ${name}, 'Calle 1', ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ST_GeogFromText(${SQUARE(lng, lat)}), s.id, ${admin.id}::uuid
    FROM municipalities m, establishment_statuses s WHERE m.dane_code = '86885' AND s.code = ${status}
    RETURNING id`;
  return { id: row.id, userId: admin.id };
}

async function newProduct(tx: Prisma.TransactionClient, establishmentId: string, userId: string, status = 'AVAILABLE') {
  const es = await tx.language.findUniqueOrThrow({ where: { code: 'es' } });
  const section = await tx.menuSection.create({ data: { establishmentId, sortOrder: 1 } });
  await tx.menuSectionTranslation.create({ data: { menuSectionId: section.id, languageId: es.id, name: 'Sección' } });
  const statusRow = await tx.productStatus.findUniqueOrThrow({ where: { code: status } });
  const product = await tx.product.create({ data: { establishmentId, menuSectionId: section.id, statusId: statusRow.id, createdByUserId: userId } });
  const version = await tx.productVersion.create({ data: { productId: product.id, price: new Prisma.Decimal('12000'), prepMinutes: 10, createdByUserId: userId } });
  await tx.productVersionText.create({ data: { productVersionId: version.id, languageId: es.id, name: 'Producto' } });
  return { section, product, version, es };
}

afterAll(() => prisma.$disconnect());

describe('Integridad del catálogo en PostgreSQL', () => {
  it('el área debe ser válida y contener el punto del local', async () => {
    await inTransaction(async (tx) => {
      const { userId } = await newEstablishment(tx, 'Prueba área');
      const bowtie = 'SRID=4326;POLYGON((-76.6 1.0, -76.5 1.1, -76.5 1.0, -76.6 1.1, -76.6 1.0))';
      await expectDbError(
        tx,
        () => tx.$executeRaw`
          INSERT INTO establishments (municipality_id, name, address_line, location, area, status_id, created_by_user_id)
          SELECT m.id, 'Moño', 'Calle', ST_SetSRID(ST_MakePoint(-76.55, 1.05), 4326)::geography, ST_GeogFromText(${bowtie}), s.id, ${userId}::uuid
          FROM municipalities m, establishment_statuses s WHERE m.dane_code = '86885' AND s.code = 'DRAFT'`,
        /area_valid_check|23514/,
      );
      await expectDbError(
        tx,
        () => tx.$executeRaw`
          INSERT INTO establishments (municipality_id, name, address_line, location, area, status_id, created_by_user_id)
          SELECT m.id, 'Fuera', 'Calle', ST_SetSRID(ST_MakePoint(-76.0, 1.5), 4326)::geography, ST_GeogFromText(${SQUARE(-76.61, 1.03)}), s.id, ${userId}::uuid
          FROM municipalities m, establishment_statuses s WHERE m.dane_code = '86885' AND s.code = 'DRAFT'`,
        /area_covers_location_check|23514/,
      );
    });
  });

  it('el nombre del local es único en el municipio sin distinguir mayúsculas', async () => {
    await inTransaction(async (tx) => {
      await newEstablishment(tx, 'Tienda Única');
      await expectDbError(tx, () => newEstablishment(tx, 'tienda única', 'DRAFT', -76.62, 1.02), /establishments_municipality_name_idx|23505|Unique/);
    });
  });

  it('las versiones y sus textos son inmutables y toda versión tiene texto en español', async () => {
    await inTransaction(async (tx) => {
      const { id, userId } = await newEstablishment(tx, 'Prueba versiones');
      const { product, version, es } = await newProduct(tx, id, userId);
      await expectDbError(tx, () => tx.productVersion.update({ where: { id: version.id }, data: { prepMinutes: 5 } }), /no se editan/);
      await expectDbError(
        tx,
        () => tx.productVersionText.update({ where: { productVersionId_languageId: { productVersionId: version.id, languageId: es.id } }, data: { name: 'Otro' } }),
        /no se editan/,
      );
      await expectDbError(tx, () => tx.productVersion.create({ data: { productId: product.id, price: new Prisma.Decimal('0'), prepMinutes: 5, createdByUserId: userId } }), /price_check|23514/);

      // Sin texto en español, la versión falla al confirmar (disparador diferido): se fuerza aquí el chequeo.
      const orphan = await tx.productVersion.create({ data: { productId: product.id, price: new Prisma.Decimal('1000'), prepMinutes: 1, createdByUserId: userId } });
      await expectDbError(tx, () => tx.$executeRaw`SET CONSTRAINTS product_versions_requires_es IMMEDIATE`, /no tiene texto en español/);
      expect(orphan.id).toBeTruthy();
    });
  });

  it('un producto solo puede estar en una sección de su mismo local', async () => {
    await inTransaction(async (tx) => {
      const a = await newEstablishment(tx, 'Local A');
      const b = await newEstablishment(tx, 'Local B', 'ACTIVE', -76.62, 1.02);
      const { section } = await newProduct(tx, a.id, a.userId);
      const status = await tx.productStatus.findUniqueOrThrow({ where: { code: 'AVAILABLE' } });
      await expectDbError(
        tx,
        () => tx.product.create({ data: { establishmentId: b.id, menuSectionId: section.id, statusId: status.id, createdByUserId: b.userId } }),
        /foreign key|Foreign key/,
      );
    });
  });

  it('v_menu oculta descontinuados y secciones dadas de baja; v_map_establishments oculta borradores', async () => {
    await inTransaction(async (tx) => {
      const { id, userId } = await newEstablishment(tx, 'Local visible');
      const draft = await newEstablishment(tx, 'Local borrador', 'DRAFT', -76.62, 1.02);
      const visible = await newProduct(tx, id, userId);
      await newProduct(tx, id, userId, 'DISCONTINUED');
      const hidden = await newProduct(tx, id, userId);
      await tx.menuSection.update({ where: { id: hidden.section.id }, data: { deactivatedAt: new Date() } });

      const menu = await tx.$queryRaw<{ product_id: string }[]>`SELECT product_id FROM v_menu WHERE establishment_id = ${id}::uuid`;
      expect(menu.map((m) => m.product_id)).toEqual([visible.product.id]);
      const map = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v_map_establishments WHERE id IN (${id}::uuid, ${draft.id}::uuid)`;
      expect(map.map((m) => m.id)).toEqual([id]);
    });
  });

  it('las transiciones de estado están en datos', async () => {
    const rows = await prisma.$queryRaw<{ pair: string }[]>`
      SELECT f.code || '>' || t.code AS pair FROM product_status_transitions x
      JOIN product_statuses f ON f.id = x.from_status_id JOIN product_statuses t ON t.id = x.to_status_id`;
    expect(rows.map((r) => r.pair)).toEqual(expect.arrayContaining(['AVAILABLE>SOLD_OUT', 'SOLD_OUT>AVAILABLE', 'AVAILABLE>DISCONTINUED']));
    expect(rows.map((r) => r.pair)).not.toContain('DISCONTINUED>AVAILABLE');
  });
});
