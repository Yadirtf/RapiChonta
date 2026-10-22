import { randomInt } from 'node:crypto';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { prismaAdapter } from '../../src/shared/infrastructure/prisma/prisma-adapter';
import { CatalogIds } from '../../src/shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { PrismaCourierDesk } from '../../src/modules/dispatch/infrastructure/prisma-courier-desk';
import { PrismaDispatchBoard } from '../../src/modules/dispatch/infrastructure/prisma-dispatch-board';
import { PrismaDispatchMaintenance } from '../../src/modules/dispatch/infrastructure/prisma-dispatch-maintenance';
import { PrismaStaffActivityReader } from '../../src/modules/dispatch/infrastructure/prisma-staff-activity.reader';

/**
 * Reglas de E07 que garantiza PostgreSQL (Docs/14-base-de-datos/E07-asignacion.md). Requieren una base
 * migrada y con la semilla (SEED_DEMO_DATA para tener productos).
 *
 * Las reglas de una sola transacción se prueban y se revierten. La aceptación simultánea necesita datos
 * confirmados (dos conexiones a la vez): esos escenarios dejan sus pedidos cancelados y su zona dada de baja.
 */
const prisma = new PrismaClient({ adapter: prismaAdapter() });
const service = prisma as unknown as PrismaService;
const ids = new CatalogIds(service);
const board = new PrismaDispatchBoard(service, ids);
const desk = new PrismaCourierDesk(service, ids);
const maintenance = new PrismaDispatchMaintenance(service, ids);
const activity = new PrismaStaffActivityReader(service);

class Rollback extends Error {}
type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

async function inTransaction(work: (tx: Tx) => Promise<void>): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await work(tx);
    throw new Rollback();
  }, { timeout: 30_000 }).catch((error) => {
    if (!(error instanceof Rollback)) throw error;
  });
}

async function expectDbError(tx: Tx, work: () => Promise<unknown>, pattern: RegExp) {
  await tx.$executeRaw`SAVEPOINT expect_error`;
  await expect(work()).rejects.toThrow(pattern);
  await tx.$executeRaw`ROLLBACK TO SAVEPOINT expect_error`;
}

const id = (table: string, code: string) => Prisma.sql`(SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE code = ${code})`;
const code = () => `RC-${Array.from({ length: 6 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[randomInt(32)]).join('')}`;
const VILLAGARZON = Prisma.sql`(SELECT id FROM municipalities WHERE dane_code = '86885')`;

/** Un domiciliario del piloto: verificado (o no), con turno abierto y una lectura reciente a `metros` al norte del centro. */
/** `pingSecondsAgo`: hace cuánto fue su última lectura (por defecto ahora); null, ninguna. */
async function courier(db: Db, staffId: string, label: string, options: { verified?: boolean; meters?: number; pingSecondsAgo?: number | null } = {}) {
  const [person] = await db.$queryRaw<{ id: string }[]>`INSERT INTO people (given_names) VALUES (${label}) RETURNING id`;
  const [user] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO users (person_id, status_id) VALUES (${person.id}::uuid, ${id('user_statuses', 'ACTIVE')}) RETURNING id`;
  await db.$executeRaw`INSERT INTO user_status_history (user_id, to_status_id, changed_by_user_id) VALUES (${user.id}::uuid, ${id('user_statuses', 'ACTIVE')}, ${staffId}::uuid)`;
  await db.$executeRaw`INSERT INTO user_roles (user_id, role_id, municipality_id, granted_by_user_id) VALUES (${user.id}::uuid, ${id('roles', 'COURIER')}, ${VILLAGARZON}, ${staffId}::uuid)`;
  await db.$executeRaw`
    INSERT INTO courier_profiles (user_id, verification_status_id, created_by_user_id)
    VALUES (${user.id}::uuid, ${id('courier_verification_statuses', 'PENDING')}, ${staffId}::uuid)`;
  await db.$executeRaw`
    INSERT INTO courier_verification_history (courier_user_id, to_status_id, changed_by_user_id)
    VALUES (${user.id}::uuid, ${id('courier_verification_statuses', 'PENDING')}, ${staffId}::uuid)`;
  if (options.verified !== false) {
    await db.$executeRaw`
      INSERT INTO courier_verification_history (courier_user_id, from_status_id, to_status_id, changed_by_user_id)
      VALUES (${user.id}::uuid, ${id('courier_verification_statuses', 'PENDING')}, ${id('courier_verification_statuses', 'VERIFIED')}, ${staffId}::uuid)`;
  }
  await db.$executeRaw`INSERT INTO courier_availability_periods (courier_user_id) VALUES (${user.id}::uuid)`;
  const lat = 1.0294 + (options.meters ?? 200) / 111_320;
  const ago = options.pingSecondsAgo === undefined ? 0 : options.pingSecondsAgo;
  if (ago !== null) {
    await db.$executeRaw`
      INSERT INTO courier_location_pings (courier_user_id, location, accuracy_m, recorded_at)
      VALUES (${user.id}::uuid, ST_SetSRID(ST_MakePoint(-76.6165, ${lat}), 4326)::geography, 8, now() - make_interval(secs => ${ago}))`;
  }
  return user.id;
}

/** Cliente, zona con tarifa y comisión, y un pedido recién hecho en un local de ejemplo. */
async function orderScenario(db: Db) {
  const [staff] = await db.$queryRaw<{ id: string }[]>`
    SELECT ur.user_id AS id FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.code = 'ADMIN' WHERE ur.revoked_at IS NULL LIMIT 1`;
  const [product] = await db.$queryRaw<{ establishment_id: string; version_id: string }[]>`
    SELECT p.establishment_id, v.id AS version_id FROM products p JOIN v_current_product_versions v ON v.product_id = p.id
    JOIN establishments e ON e.id = p.establishment_id AND e.municipality_id = ${VILLAGARZON} LIMIT 1`;
  if (!product || !staff) throw new Error('Cargue la semilla con SEED_ADMIN_* y SEED_DEMO_DATA=true antes de test:db');
  // Sin chocar con zonas vivas: se reutiliza una de prueba si ya existe.
  let [fee] = await db.$queryRaw<{ id: string }[]>`
    SELECT f.id FROM v_current_zone_fees f JOIN delivery_zones z ON z.id = f.delivery_zone_id WHERE z.name = 'Zona prueba E07'`;
  if (!fee) {
    await db.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE deactivated_at IS NULL AND municipality_id = ${VILLAGARZON}`;
    const [zone] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO delivery_zones (municipality_id, zone_kind_id, zone_shape_id, name, area, sort_order, created_by_user_id)
      SELECT ${VILLAGARZON}, k.id, s.id, 'Zona prueba E07', ST_GeogFromText('SRID=4326;POLYGON((-76.7 0.9, -76.5 0.9, -76.5 1.1, -76.7 1.1, -76.7 0.9))'), 97, ${staff.id}::uuid
      FROM zone_kinds k, zone_shapes s WHERE k.code = 'URBAN' AND s.code = 'POLYGON' RETURNING id`;
    [fee] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO delivery_zone_fees (delivery_zone_id, amount, created_by_user_id) VALUES (${zone.id}::uuid, 3000, ${staff.id}::uuid) RETURNING id`;
  }
  const [commission] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO commission_rates (municipality_id, rate, created_by_user_id) SELECT ${VILLAGARZON}, 0.15, ${staff.id}::uuid RETURNING id`;
  const [person] = await db.$queryRaw<{ id: string }[]>`INSERT INTO people (given_names) VALUES ('Cliente E07') RETURNING id`;
  const [customer] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO users (person_id, status_id) VALUES (${person.id}::uuid, ${id('user_statuses', 'ACTIVE')}) RETURNING id`;
  await db.$executeRaw`INSERT INTO user_status_history (user_id, to_status_id, changed_by_user_id) VALUES (${customer.id}::uuid, ${id('user_statuses', 'ACTIVE')}, ${staff.id}::uuid)`;
  const [address] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO addresses (owner_user_id, reference, location)
    VALUES (${customer.id}::uuid, 'Casa azul', ST_SetSRID(ST_MakePoint(-76.6165, 1.0294), 4326)::geography) RETURNING id`;
  const orderCode = code();
  const [order] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO orders (code, customer_user_id, establishment_id, delivery_address_id, delivery_zone_fee_id, commission_rate_id,
                        payment_method_id, fulfillment_mode_id, status_id)
    VALUES (${orderCode}, ${customer.id}::uuid, ${product.establishment_id}::uuid, ${address.id}::uuid, ${fee.id}::uuid, ${commission.id}::uuid,
            ${id('payment_methods', 'CASH')}, ${id('fulfillment_modes', 'COURIER_PURCHASE')}, ${id('order_statuses', 'PENDING_ASSIGNMENT')})
    RETURNING id`;
  await db.$executeRaw`INSERT INTO order_items (order_id, product_version_id, quantity) VALUES (${order.id}::uuid, ${product.version_id}::uuid, 1)`;
  await history(db, order.id, null, 'PENDING_ASSIGNMENT', customer.id, 'CUSTOMER');
  return { staffId: staff.id, customerId: customer.id, orderId: order.id, orderCode };
}

const history = (db: Db, orderId: string, from: string | null, to: string, userId: string | null, role: string | null, source = 'USER_ACTION') => db.$executeRaw`
  INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id)
  VALUES (${orderId}::uuid, ${from ? id('order_statuses', from) : null}, ${id('order_statuses', to)}, ${userId}::uuid,
          ${role ? id('roles', role) : null}, ${id('status_change_sources', source)})`;

/** Escenario confirmado (lo ven otras conexiones). */
const committed = <T>(work: (tx: Tx) => Promise<T>) => prisma.$transaction(work, { timeout: 30_000 });

const orderStatus = async (orderId: string) =>
  (await prisma.$queryRaw<{ code: string }[]>`SELECT s.code FROM orders o JOIN order_statuses s ON s.id = o.status_id WHERE o.id = ${orderId}::uuid`)[0].code;

const recipientStatuses = (orderId: string) => prisma.$queryRaw<{ courier_user_id: string; status: string }[]>`
  SELECT r.courier_user_id, s.code AS status FROM order_offer_recipients r JOIN order_offers o ON o.id = r.order_offer_id
  JOIN offer_recipient_statuses s ON s.id = r.status_id WHERE o.order_id = ${orderId}::uuid`;

/** Deja el escenario confirmado en un estado terminal: libera la asignación y cancela; cierra los turnos. */
async function cleanUp(s: { orderId: string; staffId: string }, couriers: string[]) {
  await prisma.$transaction(async (tx) => {
    const status = (await tx.$queryRaw<{ code: string }[]>`SELECT s.code FROM orders o JOIN order_statuses s ON s.id = o.status_id WHERE o.id = ${s.orderId}::uuid`)[0].code;
    await tx.$executeRaw`
      UPDATE order_offer_recipients r SET status_id = ${id('offer_recipient_statuses', 'WITHDRAWN')}, responded_at = clock_timestamp()
      FROM order_offers o WHERE o.id = r.order_offer_id AND o.order_id = ${s.orderId}::uuid AND r.status_id = ${id('offer_recipient_statuses', 'PENDING')}`;
    await tx.$executeRaw`
      UPDATE order_assignments SET released_at = clock_timestamp(), release_reason_id = ${id('assignment_release_reasons', 'ORDER_CANCELLED')}, released_by_user_id = ${s.staffId}::uuid
      WHERE order_id = ${s.orderId}::uuid AND released_at IS NULL`;
    await tx.$executeRaw`INSERT INTO order_cancellations (order_id, cancellation_reason_id) VALUES (${s.orderId}::uuid, ${id('cancellation_reasons', 'INCIDENT_RESOLUTION')})`;
    await history(tx, s.orderId, status, 'CANCELLED', s.staffId, 'OPERATOR');
    await tx.$executeRaw`
      UPDATE courier_availability_periods SET ended_at = clock_timestamp(), end_reason_id = ${id('availability_end_reasons', 'TOGGLED_OFF')}
      WHERE courier_user_id = ANY(${couriers}::uuid[]) AND ended_at IS NULL`;
  });
}

afterAll(async () => {
  await prisma.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE name = 'Zona prueba E07' AND deactivated_at IS NULL`;
  await prisma.$disconnect();
});

describe('Despacho en PostgreSQL (una transacción)', () => {
  it('solo se ofrece a domiciliarios verificados, y SPECIFIC admite uno', async () => {
    await inTransaction(async (tx) => {
      const s = await orderScenario(tx);
      const ana = await courier(tx, s.staffId, 'Ana');
      const beto = await courier(tx, s.staffId, 'Beto');
      const nuevo = await courier(tx, s.staffId, 'Sin verificar', { verified: false });
      await history(tx, s.orderId, 'PENDING_ASSIGNMENT', 'OFFERED', s.staffId, 'OPERATOR');
      const [offer] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO order_offers (order_id, offer_mode_id, sent_by_user_id, expires_at)
        VALUES (${s.orderId}::uuid, ${id('offer_modes', 'SPECIFIC')}, ${s.staffId}::uuid, now() + interval '1 minute') RETURNING id`;
      const recipient = (courierId: string) => tx.$executeRaw`
        INSERT INTO order_offer_recipients (order_offer_id, courier_user_id, status_id) VALUES (${offer.id}::uuid, ${courierId}::uuid, ${id('offer_recipient_statuses', 'PENDING')})`;
      await expectDbError(tx, () => recipient(nuevo), /verificados/);
      await recipient(ana);
      await expectDbError(tx, () => recipient(beto), /admite 1/);
      // La oferta nueva deja un aviso ORDER_OFFERED para el domiciliario en la misma transacción.
      const notes = await tx.$queryRaw<{ type: string }[]>`
        SELECT t.code AS type FROM notifications n JOIN notification_types t ON t.id = n.notification_type_id WHERE n.recipient_user_id = ${ana}::uuid`;
      expect(notes.map((n) => n.type)).toEqual(['ORDER_OFFERED']);
    });
  });

  it('la respuesta da un solo paso; solo se asigna a quien aceptó; ACCEPTED sin asignación no confirma', async () => {
    await inTransaction(async (tx) => {
      const s = await orderScenario(tx);
      const ana = await courier(tx, s.staffId, 'Ana');
      await history(tx, s.orderId, 'PENDING_ASSIGNMENT', 'OFFERED', s.staffId, 'OPERATOR');
      const [offer] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO order_offers (order_id, offer_mode_id, sent_by_user_id, expires_at)
        VALUES (${s.orderId}::uuid, ${id('offer_modes', 'BROADCAST')}, ${s.staffId}::uuid, now() + interval '1 minute') RETURNING id`;
      await tx.$executeRaw`INSERT INTO order_offer_recipients (order_offer_id, courier_user_id, status_id) VALUES (${offer.id}::uuid, ${ana}::uuid, ${id('offer_recipient_statuses', 'PENDING')})`;
      const assign = () => tx.$executeRaw`INSERT INTO order_assignments (order_id, order_offer_id, courier_user_id) VALUES (${s.orderId}::uuid, ${offer.id}::uuid, ${ana}::uuid)`;
      await expectDbError(tx, assign, /quien aceptó/);
      await expectDbError(tx, () => tx.$executeRaw`UPDATE order_offers SET expires_at = now() + interval '1 hour' WHERE id = ${offer.id}::uuid`, /no se editan/);

      await tx.$executeRaw`SAVEPOINT sin_asignacion`;
      await history(tx, s.orderId, 'OFFERED', 'ACCEPTED', ana, 'COURIER');
      await expect(tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`).rejects.toThrow(/sin asignación vigente/);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT sin_asignacion`;
      await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;

      await tx.$executeRaw`
        UPDATE order_offer_recipients SET status_id = ${id('offer_recipient_statuses', 'ACCEPTED')}, responded_at = now()
        WHERE order_offer_id = ${offer.id}::uuid`;
      await expectDbError(
        tx,
        () => tx.$executeRaw`UPDATE order_offer_recipients SET status_id = ${id('offer_recipient_statuses', 'REJECTED')} WHERE order_offer_id = ${offer.id}::uuid`,
        /una sola vez/,
      );
      await assign();
      await history(tx, s.orderId, 'OFFERED', 'ACCEPTED', ana, 'COURIER');
      await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
      await expectDbError(tx, () => tx.$executeRaw`DELETE FROM order_assignments WHERE order_id = ${s.orderId}::uuid`, /no se borran/);
    });
  });
});

describe('Despacho en PostgreSQL (datos confirmados)', () => {
  it('aceptación simultánea: de dos que aceptan a la vez solo uno gana, al otro "Ya fue tomado"', async () => {
    const { s, ana, beto } = await committed(async (tx) => {
      const s = await orderScenario(tx);
      return { s, ana: await courier(tx, s.staffId, 'Ana', { meters: 900 }), beto: await courier(tx, s.staffId, 'Beto', { meters: 150 }) };
    });
    try {
      // La lista va por cercanía al local y el envío a todos llega a los dos.
      const nearby = (await board.couriers(1_000_000, 120, s.orderId)).length;
      expect(nearby).toBe(0);
      const [{ id: municipalityId }] = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM municipalities WHERE dane_code = '86885'`;
      const listed = (await board.couriers(municipalityId, 120, s.orderId)).filter((c) => c.userId === ana || c.userId === beto);
      expect(listed.map((c) => c.userId)).toEqual([beto, ana]);

      const { offerId } = await board.createOffer({ orderId: s.orderId, mode: 'BROADCAST', sentByUserId: s.staffId, actingRole: 'OPERATOR', courierUserIds: [ana, beto] });
      expect(await orderStatus(s.orderId)).toBe('OFFERED');

      const results = await Promise.all([desk.accept(offerId, ana), desk.accept(offerId, beto)]);
      const winners = results.filter((r) => r.ok);
      const losers = results.filter((r) => !r.ok);
      expect(winners).toHaveLength(1);
      expect(losers).toEqual([{ ok: false, reason: 'TAKEN' }]);

      expect(await orderStatus(s.orderId)).toBe('ACCEPTED');
      const answers = await recipientStatuses(s.orderId);
      expect(answers.map((a) => a.status).sort()).toEqual(['ACCEPTED', 'WITHDRAWN']);
      const [assignment] = await prisma.$queryRaw<{ courier_user_id: string }[]>`
        SELECT courier_user_id FROM order_assignments WHERE order_id = ${s.orderId}::uuid AND released_at IS NULL`;
      expect(answers.find((a) => a.status === 'ACCEPTED')!.courier_user_id).toBe(assignment.courier_user_id);

      // Al perdedor se le retira la oferta; el cliente ve que ya tiene domiciliario.
      const loser = answers.find((a) => a.status === 'WITHDRAWN')!.courier_user_id;
      const notes = await prisma.$queryRaw<{ recipient_user_id: string; type: string }[]>`
        SELECT n.recipient_user_id, t.code AS type FROM notifications n JOIN notification_types t ON t.id = n.notification_type_id
        WHERE n.order_id = ${s.orderId}::uuid ORDER BY n.created_at`;
      expect(notes).toEqual(
        expect.arrayContaining([
          { recipient_user_id: loser, type: 'OFFER_WITHDRAWN' },
          { recipient_user_id: s.customerId, type: 'ORDER_STATUS_CHANGED' },
        ]),
      );
      // El que ganó ya está ocupado: no aparece para otro pedido.
      expect((await board.couriers(municipalityId, 120)).some((c) => c.userId === assignment.courier_user_id)).toBe(false);

      const audit = await activity.list({ municipalityId, orderCode: s.orderCode, limit: 10 });
      expect(audit.map((e) => e.action)).toContain('ORDER_OFFERED');
    } finally {
      await cleanUp(s, [ana, beto]);
    }
  });

  it('en turno sin ubicación reciente: aparece al final, sin distancia y marcado para que el panel no le ofrezca', async () => {
    const { s, ana, beto, caro } = await committed(async (tx) => {
      const s = await orderScenario(tx);
      return {
        s,
        ana: await courier(tx, s.staffId, 'Ana', { meters: 900 }),
        beto: await courier(tx, s.staffId, 'Beto', { meters: 100, pingSecondsAgo: 600 }),
        caro: await courier(tx, s.staffId, 'Caro', { pingSecondsAgo: null }),
      };
    });
    try {
      const [{ id: municipalityId }] = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM municipalities WHERE dane_code = '86885'`;
      const listed = (await board.couriers(municipalityId, 120, s.orderId)).filter((c) => [ana, beto, caro].includes(c.userId));
      expect(listed.map((c) => [c.userId, c.locationFresh, c.distanceMeters === null])).toEqual([
        [ana, true, false],
        [beto, false, true],
        [caro, false, true],
      ]);
      expect(listed[2]).toMatchObject({ location: null, lastSeenAt: null });
      const status = await desk.status(caro);
      expect(status?.lastLocationAt).toBeNull();
      expect((await desk.status(beto))?.lastLocationAt).toBeInstanceOf(Date);
    } finally {
      await cleanUp(s, [ana, beto, caro]);
    }
  });

  it('oferta vencida: queda EXPIRED, el pedido vuelve al panel con "Nadie aceptó" y ya no se puede aceptar', async () => {
    const { s, ana } = await committed(async (tx) => {
      const s = await orderScenario(tx);
      return { s, ana: await courier(tx, s.staffId, 'Ana') };
    });
    try {
      const [offer] = await prisma.$transaction(async (tx) => {
        await history(tx, s.orderId, 'PENDING_ASSIGNMENT', 'OFFERED', s.staffId, 'OPERATOR');
        const rows = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO order_offers (order_id, offer_mode_id, sent_by_user_id, created_at, expires_at)
          VALUES (${s.orderId}::uuid, ${id('offer_modes', 'SPECIFIC')}, ${s.staffId}::uuid, now() - interval '2 minutes', now() - interval '1 minute') RETURNING id`;
        await tx.$executeRaw`INSERT INTO order_offer_recipients (order_offer_id, courier_user_id, status_id) VALUES (${rows[0].id}::uuid, ${ana}::uuid, ${id('offer_recipient_statuses', 'PENDING')})`;
        return rows;
      });
      expect(await desk.accept(offer.id, ana)).toEqual({ ok: false, reason: 'EXPIRED' });
      expect(await maintenance.expireOffers()).toBeGreaterThanOrEqual(1);
      expect(await orderStatus(s.orderId)).toBe('PENDING_ASSIGNMENT');
      expect((await recipientStatuses(s.orderId))[0].status).toBe('EXPIRED');
      const [{ id: municipalityId }] = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM municipalities WHERE dane_code = '86885'`;
      const row = (await board.activeOrders(municipalityId)).find((o) => o.id === s.orderId)!;
      expect(row).toMatchObject({ needsCourier: true, returnedBy: 'TIMER', liveOffers: [] });
      expect(await desk.accept(offer.id, ana)).toEqual({ ok: false, reason: 'EXPIRED' });
    } finally {
      await cleanUp(s, [ana]);
    }
  });

  it('"No puedo" del único destinatario devuelve el pedido al panel sin esperar el vencimiento', async () => {
    const { s, ana } = await committed(async (tx) => {
      const s = await orderScenario(tx);
      return { s, ana: await courier(tx, s.staffId, 'Ana') };
    });
    try {
      const { offerId } = await board.createOffer({ orderId: s.orderId, mode: 'SPECIFIC', sentByUserId: s.staffId, actingRole: 'OPERATOR', courierUserIds: [ana] });
      const result = await desk.reject(offerId, ana);
      expect(result).toMatchObject({ ok: true, returnedToPanel: true });
      expect(await orderStatus(s.orderId)).toBe('PENDING_ASSIGNMENT');
      const [{ id: municipalityId }] = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM municipalities WHERE dane_code = '86885'`;
      expect((await board.activeOrders(municipalityId)).find((o) => o.id === s.orderId)!.returnedBy).toBe('OFFERS_DECLINED');
      expect((await board.couriers(municipalityId, 120, s.orderId)).find((c) => c.userId === ana)!.declined).toBe(true);
      expect(await desk.reject(offerId, ana)).toEqual({ ok: false, reason: 'CLOSED' });
    } finally {
      await cleanUp(s, [ana]);
    }
  });
});
