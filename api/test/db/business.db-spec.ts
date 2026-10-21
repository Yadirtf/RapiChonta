import { Prisma, PrismaClient } from '@prisma/client';
import { GeoCircle } from '../../src/modules/business-config/domain/value-objects/geo-circle';
import { COVERAGE_LIMITS } from '../../src/modules/business-config/domain/value-objects/zone-limits';
import { PrismaZonesRepository } from '../../src/modules/business-config/infrastructure/prisma-zones.repository';
import { GeoPoint } from '../../src/modules/catalog/domain/value-objects/geo-point';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';

/**
 * Reglas de E03 que garantiza PostgreSQL (Docs/14-base-de-datos/E03-zonas-horario-configuracion.md).
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

const rect = (w: number, s: number, e: number, n: number) => `SRID=4326;POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;

async function zone(tx: Prisma.TransactionClient, name: string, wkt: string, kind = 'URBAN') {
  const [admin] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users LIMIT 1`;
  return tx.$executeRaw`
    INSERT INTO delivery_zones (municipality_id, zone_kind_id, zone_shape_id, name, area, sort_order, created_by_user_id)
    SELECT m.id, k.id, s.id, ${name}, ST_GeogFromText(${wkt}), 1, ${admin.id}::uuid
    FROM municipalities m, zone_kinds k, zone_shapes s WHERE m.dane_code = '86885' AND k.code = ${kind} AND s.code = 'POLYGON'`;
}

afterAll(() => prisma.$disconnect());

describe('Zonas, horario y parámetros en PostgreSQL', () => {
  it('dos zonas vecinas pueden compartir borde (y pisarse menos de 1 m²), pero no superponerse', async () => {
    await inTransaction(async (tx) => {
      await tx.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE deactivated_at IS NULL`;
      await zone(tx, 'Prueba A', rect(-76.62, 1.02, -76.61, 1.03));
      await zone(tx, 'Prueba B', rect(-76.61, 1.02, -76.60, 1.03));
      // 5 mm de solape a lo largo de 1,1 km ≈ 0,6 m²: redondeo del dibujo, se acepta.
      await zone(tx, 'Prueba C', rect(-76.60000000449, 1.02, -76.59, 1.03));
      await expectDbError(tx, () => zone(tx, 'Prueba D', rect(-76.615, 1.025, -76.605, 1.035)), /superpone/);
    });
  });

  it('la cobertura contiene barrios sin contar como superposición, y hay una sola activa por municipio', async () => {
    await inTransaction(async (tx) => {
      await tx.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE deactivated_at IS NULL`;
      await zone(tx, 'Cobertura', rect(-76.64, 1.0, -76.59, 1.05), 'COVERAGE');
      await zone(tx, 'Centro', rect(-76.62, 1.02, -76.61, 1.03));
      await expectDbError(tx, () => zone(tx, 'Otra cobertura', rect(-76.7, 1.0, -76.65, 1.05), 'COVERAGE'), /ya tiene una cobertura|23505/);
    });
  });

  it('el repositorio recupera el radio, prefiere el barrio a la tarifa base y mide la distancia a la cobertura', async () => {
    await inTransaction(async (tx) => {
      await tx.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE deactivated_at IS NULL`;
      const repo = new PrismaZonesRepository(tx as unknown as PrismaService);
      const [admin] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users LIMIT 1`;
      const [{ id: municipalityId }] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM municipalities WHERE dane_code = '86885'`;
      const plaza = GeoPoint.create(1.0294, -76.6165);
      const circle = GeoCircle.create(plaza, 3_000).toPolygon(COVERAGE_LIMITS);
      const [{ id: coverageId }] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO delivery_zones (municipality_id, zone_kind_id, zone_shape_id, name, area, sort_order, created_by_user_id)
        SELECT ${municipalityId}, k.id, s.id, 'Cobertura Villagarzón', ST_GeogFromText(${`SRID=4326;${circle.toWkt()}`}), 9, ${admin.id}::uuid
        FROM zone_kinds k, zone_shapes s WHERE k.code = 'COVERAGE' AND s.code = 'CIRCLE' RETURNING id`;
      await tx.$executeRaw`INSERT INTO delivery_zone_fees (delivery_zone_id, amount, created_by_user_id) VALUES (${coverageId}::uuid, 4000, ${admin.id}::uuid)`;
      await zone(tx, 'Centro', rect(-76.6175, 1.0285, -76.6155, 1.0305));
      await tx.$executeRaw`
        INSERT INTO delivery_zone_fees (delivery_zone_id, amount, created_by_user_id)
        SELECT id, 3000, ${admin.id}::uuid FROM delivery_zones WHERE name = 'Centro' AND deactivated_at IS NULL`;

      const stored = await repo.find(coverageId);
      expect(stored).toMatchObject({ kind: 'COVERAGE', shape: 'CIRCLE' });
      expect(stored!.circle!.radiusMeters).toBeGreaterThanOrEqual(2_995);
      expect(stored!.circle!.radiusMeters).toBeLessThanOrEqual(3_005);
      expect(GeoPoint.create(stored!.circle!.center.lat, stored!.circle!.center.lng).distanceTo(plaza)).toBeLessThan(5);

      expect((await repo.quote(municipalityId, plaza))?.zone.name).toBe('Centro');
      expect((await repo.quote(municipalityId, GeoPoint.create(1.0444, -76.6165)))?.zone.kind).toBe('COVERAGE');
      expect(await repo.quote(municipalityId, GeoPoint.create(1.08, -76.6165))).toBeNull();
      expect((await repo.locate(plaza))?.municipalityName).toBe('Villagarzón');
      const far = await repo.distanceToCoverage(GeoPoint.create(1.08, -76.6165), municipalityId);
      expect(far!.meters).toBeGreaterThan(2_500);
      expect(far!.meters).toBeLessThan(3_100);

      const [map] = await repo.coverage(municipalityId);
      expect(map.municipality.name).toBe('Villagarzón');
      expect(map.polygons).toHaveLength(1); // el barrio queda dentro de la cobertura: la unión es una sola pieza
    });
  });

  it('el horario no admite franjas que se cruzan ni días mezclados', async () => {
    await inTransaction(async (tx) => {
      const [admin] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users LIMIT 1`;
      await tx.$executeRaw`UPDATE operating_hours SET deactivated_at = now() WHERE deactivated_at IS NULL`;
      const slot = (weekday: number, opens: string, closes: string) => tx.$executeRaw`
        INSERT INTO operating_hours (municipality_id, weekday, opens_at, closes_at, created_by_user_id)
        SELECT id, ${weekday}, ${opens}::time, ${closes}::time, ${admin.id}::uuid FROM municipalities WHERE dane_code = '86885'`;
      await slot(1, '08:00', '14:00');
      await slot(1, '14:00', '24:00');
      await expectDbError(tx, () => slot(1, '13:00', '15:00'), /operating_hours_no_overlap|23P01|exclusion/i);
      const exception = (opens: string | null, closes: string | null) => tx.$executeRaw`
        INSERT INTO operating_hour_exceptions (municipality_id, on_date, opens_at, closes_at)
        SELECT id, '2030-01-01', ${opens}::time, ${closes}::time FROM municipalities WHERE dane_code = '86885'`;
      await exception(null, null);
      await expectDbError(tx, () => exception('08:00', '12:00'), /cerrado y tener franjas/);
    });
  });

  it('las versiones de tarifa, parámetros y comisión son inmutables', async () => {
    await inTransaction(async (tx) => {
      const [admin] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users LIMIT 1`;
      await tx.$executeRaw`INSERT INTO commission_rates (municipality_id, rate, created_by_user_id) SELECT id, 0.1, ${admin.id}::uuid FROM municipalities WHERE dane_code = '86885'`;
      await expectDbError(tx, () => tx.$executeRaw`UPDATE commission_rates SET rate = 0.2`, /no se editan/);
      await expectDbError(tx, () => tx.$executeRaw`UPDATE setting_values SET value = 1`, /no se editan/);
      await expectDbError(
        tx,
        () => tx.$executeRaw`INSERT INTO commission_rates (municipality_id, rate, created_by_user_id) SELECT id, 1, ${admin.id}::uuid FROM municipalities WHERE dane_code = '86885'`,
        /commission_rates_rate_check|23514/,
      );
    });
  });
});
