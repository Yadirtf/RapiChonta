import { Prisma, PrismaClient } from '@prisma/client';
import { ESTABLISHMENT_STATUSES, PRODUCT_STATUSES } from '../../modules/catalog/domain/catalog.codes';
import { establishmentPhone, normalizeCategories } from '../../modules/catalog/domain/value-objects/establishment-fields';
import { GeoPoint } from '../../modules/catalog/domain/value-objects/geo-point';
import { GeoPolygon } from '../../modules/catalog/domain/value-objects/geo-polygon';
import { normalizeNames, normalizeProductTexts, sameProductTexts } from '../../modules/catalog/domain/value-objects/localized-text';
import { assertPrepMinutes, Price } from '../../modules/catalog/domain/value-objects/price';

type Tx = Prisma.TransactionClient;
type Row = Record<string, string>;

export interface ImportInput {
  establishments: Row[];
  products: Row[];
  municipalityDaneCode: string;
  actorUserId: string;
}

export interface ImportReport {
  establishments: { created: number; updated: number };
  products: { created: number; newVersions: number; unchanged: number };
  activated: string[];
  errors: string[];
}

const yes = (value: string | undefined, fallback: boolean) => (value ? /^(s[ií]|yes|true|1|x)$/i.test(value.trim()) : fallback);
const point = (p: GeoPoint) => Prisma.sql`ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography`;
const polygon = (a: GeoPolygon) => Prisma.sql`ST_GeogFromText(${`SRID=4326;${a.toWkt()}`})`;
const key = (text: string) => text.trim().toLowerCase();

/** "lng lat; lng lat; …" (también con | o ,) o WKT POLYGON((lng lat, …)). Sin área, un cuadrado de `radius` metros alrededor del punto. */
function parseArea(raw: string | undefined, location: GeoPoint, radius: number): GeoPolygon {
  const text = (raw ?? '').trim();
  if (!text) return GeoPolygon.squareAround(location, radius);
  const body = text.replace(/^POLYGON\s*\(\(/i, '').replace(/\)\)\s*$/, '');
  const ring = body.split(/[;,|]/).map((pair) => pair.trim().split(/\s+/).map(Number) as [number, number]);
  return GeoPolygon.fromRing(ring);
}

/**
 * Carga del catálogo (H02.6) desde dos tablas: establecimientos y productos. Se puede repetir sin duplicar:
 * - el local se reconoce por su nombre en el municipio (índice único sin mayúsculas);
 * - la sección, por su nombre en español dentro del local;
 * - el producto, por su nombre en español dentro del local. Si cambió precio, tiempo o textos se crea una versión
 *   nueva (los pedidos viejos conservan la suya); si no, no se toca.
 * Cada local se carga en su propia transacción: un error en uno no deja a medias a los demás.
 */
export async function importCatalog(prisma: PrismaClient, input: ImportInput): Promise<ImportReport> {
  const report: ImportReport = { establishments: { created: 0, updated: 0 }, products: { created: 0, newVersions: 0, unchanged: 0 }, activated: [], errors: [] };
  const [municipality] = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM municipalities WHERE dane_code = ${input.municipalityDaneCode}`;
  if (!municipality) throw new Error(`No existe el municipio ${input.municipalityDaneCode}`);
  const languages = Object.fromEntries((await prisma.language.findMany()).map((l) => [l.code, l.id]));
  const productStatus = Object.fromEntries((await prisma.productStatus.findMany()).map((s) => [s.code, s.id]));

  const productsByPlace = new Map<string, { row: Row; line: number }[]>();
  input.products.forEach((row, index) => {
    const place = key(row.establecimiento ?? row.establishment ?? '');
    productsByPlace.set(place, [...(productsByPlace.get(place) ?? []), { row, line: index + 2 }]);
  });

  for (const [index, row] of input.establishments.entries()) {
    const label = `establecimientos.csv línea ${index + 2} (${row.nombre ?? row.name ?? '?'})`;
    try {
      await prisma.$transaction(
        async (tx) => {
          const name = (row.nombre ?? row.name ?? '').trim().replace(/\s+/g, ' ');
          if (!name) throw new Error('falta el nombre');
          const location = GeoPoint.create(Number(row.latitud ?? row.lat), Number(row.longitud ?? row.lng));
          const area = parseArea(row.area, location, Number(row.radio_area_m || 12));
          if (!area.covers(location)) throw new Error('el área no contiene el punto');
          const categories = normalizeCategories((row.categorias ?? row.categories ?? '').split('|'));
          const phones = [...new Set((row.telefonos ?? row.phones ?? '').split('|').filter(Boolean).map(establishmentPhone))];
          const address = (row.direccion ?? row.address ?? '').trim();
          if (address.length < 3) throw new Error('falta la dirección');

          const [existing] = await tx.$queryRaw<{ id: string; status: string }[]>`
            SELECT e.id, s.code AS status FROM establishments e JOIN establishment_statuses s ON s.id = e.status_id
            WHERE e.municipality_id = ${municipality.id} AND lower(e.name) = lower(${name})`;
          let id = existing?.id;
          if (id) {
            await tx.$executeRaw`
              UPDATE establishments SET name = ${name}, address_line = ${address}, location = ${point(location)}, area = ${polygon(area)}, updated_at = now()
              WHERE id = ${id}::uuid`;
            await tx.establishmentCategoryLink.deleteMany({ where: { establishmentId: id } });
            await tx.establishmentPhone.deleteMany({ where: { establishmentId: id } });
            report.establishments.updated++;
          } else {
            [{ id }] = await tx.$queryRaw<{ id: string }[]>`
              INSERT INTO establishments (municipality_id, name, address_line, location, area, status_id, created_by_user_id)
              SELECT ${municipality.id}, ${name}, ${address}, ${point(location)}, ${polygon(area)}, s.id, ${input.actorUserId}::uuid
              FROM establishment_statuses s WHERE s.code = ${ESTABLISHMENT_STATUSES.DRAFT}
              RETURNING id`;
            report.establishments.created++;
          }
          for (const [position, code] of categories.entries()) {
            const inserted = await tx.$executeRaw`
              INSERT INTO establishment_category_links (establishment_id, category_id, is_primary)
              SELECT ${id}::uuid, c.id, ${position === 0} FROM establishment_categories c WHERE c.code = ${code} AND c.deactivated_at IS NULL`;
            if (!inserted) throw new Error(`categoría desconocida ${code}`);
          }
          if (phones.length) await tx.establishmentPhone.createMany({ data: phones.map((phoneE164) => ({ establishmentId: id!, phoneE164 })) });

          await importProducts(tx, id!, productsByPlace.get(key(name)) ?? [], { ...input, languages, productStatus }, report);

          // Se activa si la tabla lo pide y ya tiene algo que vender; un local cerrado o inactivo no se toca.
          const wantsActive = yes(row.activo ?? row.active, true);
          const status = existing?.status ?? ESTABLISHMENT_STATUSES.DRAFT;
          if (wantsActive && status === ESTABLISHMENT_STATUSES.DRAFT) {
            const [{ count }] = await tx.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM v_menu WHERE establishment_id = ${id}::uuid AND is_orderable`;
            if (count > 0) {
              await tx.$executeRaw`UPDATE establishments SET status_id = (SELECT id FROM establishment_statuses WHERE code = ${ESTABLISHMENT_STATUSES.ACTIVE}) WHERE id = ${id}::uuid`;
              report.activated.push(name);
            }
          }
          if (!existing) await tx.$executeRaw`
            INSERT INTO audit_logs (actor_user_id, action_id, entity_table, entity_id, changes)
            SELECT ${input.actorUserId}::uuid, id, 'establishments', ${id}, ${JSON.stringify({ import: true })}::jsonb FROM audit_actions WHERE code = 'ESTABLISHMENT_CHANGED'`;
        },
        { timeout: 60_000 },
      );
    } catch (error) {
      report.errors.push(`${label}: ${describe(error)}`);
    }
  }

  const known = new Set(input.establishments.map((r) => key(r.nombre ?? r.name ?? '')));
  for (const [place, rows] of productsByPlace) {
    if (!known.has(place)) rows.forEach(({ line }) => report.errors.push(`productos.csv línea ${line}: el establecimiento "${place}" no está en establecimientos.csv`));
  }
  return report;
}

async function importProducts(
  tx: Tx,
  establishmentId: string,
  rows: { row: Row; line: number }[],
  context: ImportInput & { languages: Record<string, number>; productStatus: Record<string, number> },
  report: ImportReport,
): Promise<void> {
  const sections = await tx.menuSection.findMany({
    where: { establishmentId, deactivatedAt: null },
    include: { translations: { where: { languageId: context.languages.es } } },
  });
  const sectionIds = new Map(sections.map((s) => [key(s.translations[0]?.name ?? ''), s.id]));
  const positionInSection = new Map<string, number>();

  for (const { row, line } of rows) {
    try {
      const sectionNames = normalizeNames({ es: row.seccion ?? row.section, en: row.seccion_en ?? row.section_en });
      let sectionId = sectionIds.get(key(sectionNames.es!));
      if (!sectionId) {
        const { _max } = await tx.menuSection.aggregate({ where: { establishmentId }, _max: { sortOrder: true } });
        sectionId = (await tx.menuSection.create({ data: { establishmentId, sortOrder: (_max.sortOrder ?? 0) + 1 } })).id;
        for (const [language, name] of Object.entries(sectionNames)) {
          await tx.menuSectionTranslation.create({ data: { menuSectionId: sectionId, languageId: context.languages[language], name: name! } });
        }
        sectionIds.set(key(sectionNames.es!), sectionId);
      }
      const texts = normalizeProductTexts({
        es: { name: row.nombre ?? row.name, description: row.descripcion ?? row.description },
        en: { name: row.nombre_en ?? row.name_en, description: row.descripcion_en ?? row.description_en },
      });
      const price = Price.parse(row.precio ?? row.price ?? '');
      const prepMinutes = assertPrepMinutes(Number(row.minutos_preparacion ?? row.prep_minutes ?? 0));
      const available = yes(row.disponible ?? row.available, true);
      const sortOrder = (positionInSection.get(sectionId) ?? 0) + 1;
      positionInSection.set(sectionId, sortOrder);

      const [match] = await tx.$queryRaw<{ id: string; section_id: string; status: string; version_id: string; price: string; prep_minutes: number }[]>`
        SELECT p.id, p.menu_section_id AS section_id, ps.code AS status, v.id AS version_id, v.price::text AS price, v.prep_minutes
        FROM products p
        JOIN product_statuses ps ON ps.id = p.status_id AND ps.is_visible
        JOIN v_current_product_versions v ON v.product_id = p.id
        JOIN product_version_texts t ON t.product_version_id = v.id AND t.language_id = ${context.languages.es}
        WHERE p.establishment_id = ${establishmentId}::uuid AND lower(t.name) = lower(${texts.es!.name})
        LIMIT 1`;

      let productId = match?.id;
      if (!productId) {
        productId = (
          await tx.product.create({
            data: {
              establishmentId,
              menuSectionId: sectionId,
              statusId: context.productStatus[available ? PRODUCT_STATUSES.AVAILABLE : PRODUCT_STATUSES.SOLD_OUT],
              sortOrder,
              createdByUserId: context.actorUserId,
            },
          })
        ).id;
        await writeVersion(tx, productId, price, prepMinutes, texts, context);
        report.products.created++;
        continue;
      }

      const currentTexts = Object.fromEntries(
        (await tx.productVersionText.findMany({ where: { productVersionId: match.version_id }, include: { language: true } })).map((t) => [
          t.language.code,
          { name: t.name, description: t.description },
        ]),
      );
      const changed = !Price.parse(match.price).equals(price) || match.prep_minutes !== prepMinutes || !sameProductTexts(texts, currentTexts);
      if (changed) await writeVersion(tx, productId, price, prepMinutes, texts, context);
      changed ? report.products.newVersions++ : report.products.unchanged++;
      const status = available ? PRODUCT_STATUSES.AVAILABLE : PRODUCT_STATUSES.SOLD_OUT;
      await tx.product.update({
        where: { id: productId },
        data: { menuSectionId: sectionId, sortOrder, ...(match.status !== status ? { statusId: context.productStatus[status] } : {}) },
      });
    } catch (error) {
      report.errors.push(`productos.csv línea ${line}: ${describe(error)}`);
    }
  }
}

async function writeVersion(
  tx: Tx,
  productId: string,
  price: Price,
  prepMinutes: number,
  texts: ReturnType<typeof normalizeProductTexts>,
  context: { actorUserId: string; languages: Record<string, number> },
) {
  const version = await tx.productVersion.create({
    data: { productId, price: new Prisma.Decimal(price.toDecimalString()), prepMinutes, createdByUserId: context.actorUserId },
  });
  for (const [language, text] of Object.entries(texts)) {
    await tx.productVersionText.create({ data: { productVersionId: version.id, languageId: context.languages[language], name: text!.name, description: text!.description } });
  }
}

const describe = (error: unknown) => {
  const e = error as { code?: string; message?: string; details?: unknown };
  return e.code && e.details ? `${e.code} ${JSON.stringify(e.details)}` : e.code && !String(e.code).startsWith('P') ? e.code : (e.message ?? String(error)).split('\n').pop()!;
};
