import { randomInt, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { prismaAdapter } from '../../src/shared/infrastructure/prisma/prisma-adapter';
import { CatalogIds } from '../../src/shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { SettingsReader } from '../../src/shared/infrastructure/settings/settings.reader';
import { PrismaCourierTrips } from '../../src/modules/fulfillment/infrastructure/prisma-courier-trips';
import { PrismaGeofenceProbe } from '../../src/modules/fulfillment/infrastructure/prisma-geofence.probe';
import { PrismaPreparationWatch } from '../../src/modules/fulfillment/infrastructure/prisma-preparation.watch';
import { PrismaOrdersRepository } from '../../src/modules/orders/infrastructure/prisma-orders.repository';
import { PrismaCourierDesk } from '../../src/modules/dispatch/infrastructure/prisma-courier-desk';
import { PrismaDispatchMaintenance } from '../../src/modules/dispatch/infrastructure/prisma-dispatch-maintenance';
import { TripRef } from '../../src/modules/fulfillment/domain/ports/courier-trips';

/**
 * E08 en PostgreSQL (Docs/14-base-de-datos/E08-modo-domiciliario.md): geocercas con ST_Covers / ST_DWithin,
 * compra con factura, preparación y modo cliente. Los repositorios abren sus propias transacciones, así que el
 * escenario se confirma y al final el pedido queda cancelado (o entregado) y los turnos cerrados.
 * Requiere la base migrada y la semilla con SEED_ADMIN_* y SEED_DEMO_DATA=true.
 */
const prisma = new PrismaClient({ adapter: prismaAdapter() });
const service = prisma as unknown as PrismaService;
const ids = new CatalogIds(service);
const trips = new PrismaCourierTrips(service, ids);
const probe = new PrismaGeofenceProbe(service, ids, new SettingsReader(service));
const watch = new PrismaPreparationWatch(service);
const orders = new PrismaOrdersRepository(service, ids);
const desk = new PrismaCourierDesk(service, ids);
const maintenance = new PrismaDispatchMaintenance(service, ids);

type Db = Prisma.TransactionClient | PrismaClient;

const id = (table: string, code: string) => Prisma.sql`(SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE code = ${code})`;
const code = () => `RC-${Array.from({ length: 6 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[randomInt(32)]).join('')}`;
const VILLAGARZON = Prisma.sql`(SELECT id FROM municipalities WHERE dane_code = '86885')`;
/** Un punto a `north` metros al norte y `east` al este de otro. */
const offset = (lat: number, lng: number, north: number, east = 0) => ({ lat: lat + north / 111_320, lng: lng + east / (111_320 * Math.cos((lat * Math.PI) / 180)) });

const history = (db: Db, orderId: string, from: string | null, to: string, userId: string | null, role: string | null, source = 'USER_ACTION') => db.$executeRaw`
  INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id)
  VALUES (${orderId}::uuid, ${from ? id('order_statuses', from) : null}, ${id('order_statuses', to)}, ${userId}::uuid,
          ${role ? id('roles', role) : null}, ${id('status_change_sources', source)})`;

const statusOf = async (orderId: string) =>
  (await prisma.$queryRaw<{ code: string }[]>`SELECT s.code FROM orders o JOIN order_statuses s ON s.id = o.status_id WHERE o.id = ${orderId}::uuid`)[0].code;

interface Scenario {
  staffId: string;
  customerId: string;
  courierId: string;
  orderId: string;
  orderCode: string;
  store: { lat: number; lng: number };
  home: { lat: number; lng: number };
}

/** Pedido confirmado y aceptado por un domiciliario verificado, con turno abierto. */
async function acceptedOrder(): Promise<Scenario> {
  return prisma.$transaction(
    async (tx) => {
      const [staff] = await tx.$queryRaw<{ id: string }[]>`
        SELECT ur.user_id AS id FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.code = 'ADMIN' WHERE ur.revoked_at IS NULL LIMIT 1`;
      const [product] = await tx.$queryRaw<{ establishment_id: string; version_id: string; lat: number; lng: number }[]>`
        SELECT p.establishment_id, v.id AS version_id, ST_Y(e.location::geometry) AS lat, ST_X(e.location::geometry) AS lng
        FROM products p JOIN v_current_product_versions v ON v.product_id = p.id
        JOIN establishments e ON e.id = p.establishment_id AND e.municipality_id = ${VILLAGARZON}
        ORDER BY e.name LIMIT 1`;
      if (!product || !staff) throw new Error('Cargue la semilla con SEED_ADMIN_* y SEED_DEMO_DATA=true antes de test:db');
      let [fee] = await tx.$queryRaw<{ id: string }[]>`
        SELECT f.id FROM v_current_zone_fees f JOIN delivery_zones z ON z.id = f.delivery_zone_id WHERE z.name = 'Zona prueba E08' AND z.deactivated_at IS NULL`;
      if (!fee) {
        await tx.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE deactivated_at IS NULL AND municipality_id = ${VILLAGARZON}`;
        const [zone] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO delivery_zones (municipality_id, zone_kind_id, zone_shape_id, name, area, sort_order, created_by_user_id)
          SELECT ${VILLAGARZON}, k.id, s.id, 'Zona prueba E08', ST_GeogFromText('SRID=4326;POLYGON((-76.7 0.9, -76.5 0.9, -76.5 1.1, -76.7 1.1, -76.7 0.9))'), 98, ${staff.id}::uuid
          FROM zone_kinds k, zone_shapes s WHERE k.code = 'URBAN' AND s.code = 'POLYGON' RETURNING id`;
        [fee] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO delivery_zone_fees (delivery_zone_id, amount, created_by_user_id) VALUES (${zone.id}::uuid, 3000, ${staff.id}::uuid) RETURNING id`;
      }
      const [commission] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO commission_rates (municipality_id, rate, created_by_user_id) SELECT ${VILLAGARZON}, 0.15, ${staff.id}::uuid RETURNING id`;

      const person = async (name: string) => (await tx.$queryRaw<{ id: string }[]>`INSERT INTO people (given_names) VALUES (${name}) RETURNING id`)[0].id;
      const user = async (name: string) => {
        const [u] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO users (person_id, status_id) VALUES (${await person(name)}::uuid, ${id('user_statuses', 'ACTIVE')}) RETURNING id`;
        await tx.$executeRaw`INSERT INTO user_status_history (user_id, to_status_id, changed_by_user_id) VALUES (${u.id}::uuid, ${id('user_statuses', 'ACTIVE')}, ${staff.id}::uuid)`;
        return u.id;
      };
      const customerId = await user('Cliente E08');
      const courierId = await user('Domiciliario E08');
      await tx.$executeRaw`INSERT INTO user_roles (user_id, role_id, municipality_id, granted_by_user_id) VALUES (${courierId}::uuid, ${id('roles', 'COURIER')}, ${VILLAGARZON}, ${staff.id}::uuid)`;
      await tx.$executeRaw`INSERT INTO courier_profiles (user_id, verification_status_id, created_by_user_id) VALUES (${courierId}::uuid, ${id('courier_verification_statuses', 'PENDING')}, ${staff.id}::uuid)`;
      await tx.$executeRaw`INSERT INTO courier_verification_history (courier_user_id, to_status_id, changed_by_user_id) VALUES (${courierId}::uuid, ${id('courier_verification_statuses', 'PENDING')}, ${staff.id}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO courier_verification_history (courier_user_id, from_status_id, to_status_id, changed_by_user_id)
        VALUES (${courierId}::uuid, ${id('courier_verification_statuses', 'PENDING')}, ${id('courier_verification_statuses', 'VERIFIED')}, ${staff.id}::uuid)`;
      await tx.$executeRaw`INSERT INTO courier_availability_periods (courier_user_id) VALUES (${courierId}::uuid)`;

      // El cliente vive a ~600 m al norte del local.
      const home = offset(product.lat, product.lng, 600);
      const [address] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO addresses (owner_user_id, line, reference, location)
        VALUES (${customerId}::uuid, 'Calle 5 # 3-20', 'Casa azul', ST_SetSRID(ST_MakePoint(${home.lng}, ${home.lat}), 4326)::geography) RETURNING id`;
      const orderCode = code();
      const [order] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO orders (code, customer_user_id, establishment_id, delivery_address_id, delivery_zone_fee_id, commission_rate_id,
                            payment_method_id, fulfillment_mode_id, status_id)
        VALUES (${orderCode}, ${customerId}::uuid, ${product.establishment_id}::uuid, ${address.id}::uuid, ${fee.id}::uuid, ${commission.id}::uuid,
                ${id('payment_methods', 'CASH')}, ${id('fulfillment_modes', 'COURIER_PURCHASE')}, ${id('order_statuses', 'PENDING_ASSIGNMENT')})
        RETURNING id`;
      await tx.$executeRaw`INSERT INTO order_items (order_id, product_version_id, quantity) VALUES (${order.id}::uuid, ${product.version_id}::uuid, 2)`;
      await history(tx, order.id, null, 'PENDING_ASSIGNMENT', customerId, 'CUSTOMER');
      await history(tx, order.id, 'PENDING_ASSIGNMENT', 'OFFERED', staff.id, 'OPERATOR');
      const [offer] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO order_offers (order_id, offer_mode_id, sent_by_user_id, expires_at)
        VALUES (${order.id}::uuid, ${id('offer_modes', 'SPECIFIC')}, ${staff.id}::uuid, now() + interval '1 minute') RETURNING id`;
      await tx.$executeRaw`INSERT INTO order_offer_recipients (order_offer_id, courier_user_id, status_id) VALUES (${offer.id}::uuid, ${courierId}::uuid, ${id('offer_recipient_statuses', 'PENDING')})`;
      await tx.$executeRaw`UPDATE order_offer_recipients SET status_id = ${id('offer_recipient_statuses', 'ACCEPTED')}, responded_at = clock_timestamp() WHERE order_offer_id = ${offer.id}::uuid`;
      await tx.$executeRaw`INSERT INTO order_assignments (order_id, order_offer_id, courier_user_id) VALUES (${order.id}::uuid, ${offer.id}::uuid, ${courierId}::uuid)`;
      // Aceptado hace 90 s: las lecturas de la prueba (de hace segundos) son posteriores a la aceptación.
      await tx.$executeRaw`
        INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id, occurred_at)
        VALUES (${order.id}::uuid, ${id('order_statuses', 'OFFERED')}, ${id('order_statuses', 'ACCEPTED')}, ${courierId}::uuid,
                ${id('roles', 'COURIER')}, ${id('status_change_sources', 'USER_ACTION')}, now() - interval '90 seconds')`;
      return { staffId: staff.id, customerId, courierId, orderId: order.id, orderCode, store: { lat: product.lat, lng: product.lng }, home };
    },
    { timeout: 30_000 },
  );
}

/** Lecturas confirmadas del domiciliario (hace `secondsAgo` segundos), como las guarda POST /courier/locations. */
const ping = (courierId: string, at: { lat: number; lng: number }, secondsAgo: number, accuracy = 8) => prisma.$executeRaw`
  INSERT INTO courier_location_pings (courier_user_id, location, accuracy_m, recorded_at)
  VALUES (${courierId}::uuid, ST_SetSRID(ST_MakePoint(${at.lng}, ${at.lat}), 4326)::geography, ${accuracy}, now() - make_interval(secs => ${secondsAgo}))`;

/** Una foto de factura subida por `userId`. */
async function receipt(userId: string): Promise<string> {
  const [file] = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO files (purpose_id, storage_key, mime_type, size_bytes, sha256, uploaded_by_user_id)
    SELECT p.id, 'files/' || gen_random_uuid(), 'image/jpeg', 1000, ${randomUUID().replace(/-/g, '').padEnd(64, '0')}, ${userId}::uuid
    FROM file_purposes p WHERE p.code = 'PURCHASE_RECEIPT' RETURNING id`;
  return file.id;
}

const command = (s: Scenario, ref: TripRef, occurredAt = new Date()) => ({
  courierUserId: s.courierId,
  trip: ref,
  clientEventId: randomUUID(),
  occurredAt,
  offline: false,
});

const refOf = async (s: Scenario) => (await trips.ref(s.courierId, s.orderCode))!;

/** Deja el pedido en un estado terminal por un camino válido de la máquina de estados, y cierra los turnos. */
async function finish(s: Scenario) {
  const status = await statusOf(s.orderId);
  await prisma.$transaction(async (tx) => {
    let current = status;
    if (current === 'PREPARING') {
      await history(tx, s.orderId, 'PREPARING', 'ON_THE_WAY', s.courierId, 'COURIER');
      current = 'ON_THE_WAY';
    }
    if (current === 'ON_THE_WAY' || current === 'ARRIVING') {
      await history(tx, s.orderId, current, 'DISPUTED', s.customerId, 'CUSTOMER');
      current = 'DISPUTED';
    }
    if (current !== 'CANCELLED' && current !== 'DELIVERED') {
      await tx.$executeRaw`
        UPDATE order_assignments SET released_at = clock_timestamp(), release_reason_id = ${id('assignment_release_reasons', 'ORDER_CANCELLED')}, released_by_user_id = ${s.staffId}::uuid
        WHERE order_id = ${s.orderId}::uuid AND released_at IS NULL`;
      await history(tx, s.orderId, current, 'CANCELLED', s.staffId, 'OPERATOR');
    }
    await tx.$executeRaw`
      UPDATE courier_availability_periods SET ended_at = clock_timestamp(), end_reason_id = ${id('availability_end_reasons', 'TOGGLED_OFF')}
      WHERE courier_user_id = ${s.courierId}::uuid AND ended_at IS NULL`;
  });
}

afterAll(async () => {
  await prisma.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE name = 'Zona prueba E08' AND deactivated_at IS NULL`;
  await prisma.$disconnect();
});

describe('Geocerca del local (H08.3)', () => {
  it('una sola lectura dentro no cambia; dos seguidas dentro pasan a AT_ESTABLISHMENT con fuente GEOFENCE y avisan al cliente', async () => {
    const s = await acceptedOrder();
    try {
      await ping(s.courierId, offset(s.store.lat, s.store.lng, 300), 20);
      await ping(s.courierId, s.store, 10);
      expect(await probe.evaluate(s.courierId)).toBeNull();
      expect(await statusOf(s.orderId)).toBe('ACCEPTED');

      // Una lectura imprecisa (> 50 m) dentro no cuenta: la anterior (fuera) sigue siendo la que vale.
      await ping(s.courierId, s.store, 8, 120);
      expect(await probe.evaluate(s.courierId)).toBeNull();

      await ping(s.courierId, offset(s.store.lat, s.store.lng, 5), 5);
      expect(await probe.evaluate(s.courierId)).toEqual({ orderCode: s.orderCode, status: 'AT_ESTABLISHMENT' });
      expect(await statusOf(s.orderId)).toBe('AT_ESTABLISHMENT');

      const [row] = await prisma.$queryRaw<{ source: string; by: string | null }[]>`
        SELECT src.code AS source, h.changed_by_user_id AS by FROM order_status_history h JOIN status_change_sources src ON src.id = h.source_id
        WHERE h.order_id = ${s.orderId}::uuid ORDER BY h.recorded_at DESC LIMIT 1`;
      expect(row).toEqual({ source: 'GEOFENCE', by: null });
      const notes = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications WHERE recipient_user_id = ${s.customerId}::uuid AND order_id = ${s.orderId}::uuid`;
      expect(notes[0].n).toBeGreaterThanOrEqual(1);
      // Ya llegó: otra lectura no hace nada.
      expect(await probe.evaluate(s.courierId)).toBeNull();
    } finally {
      await finish(s);
    }
  });

  it('las lecturas viejas (de la cola sin señal) no disparan la llegada', async () => {
    const s = await acceptedOrder();
    try {
      await ping(s.courierId, s.store, 600);
      await ping(s.courierId, s.store, 590);
      expect(await probe.evaluate(s.courierId)).toBeNull();
      expect(await statusOf(s.orderId)).toBe('ACCEPTED');
    } finally {
      await finish(s);
    }
  });
});

describe('Compra, preparación y llegada donde el cliente (H08.4-H08.6)', () => {
  it('recorre el pedido completo con las reglas de la base', async () => {
    const s = await acceptedOrder();
    try {
      await ping(s.courierId, s.store, 6);
      await ping(s.courierId, s.store, 3);
      await probe.evaluate(s.courierId);

      // Antes de llevar el pedido, el domiciliario no ve la dirección exacta ni el teléfono.
      let trip = await trips.active(s.courierId, 'es');
      expect(trip).toMatchObject({ code: s.orderCode, status: 'AT_ESTABLISHMENT', destination: null, preparation: null, purchase: null });
      expect(trip!.lines[0].quantity).toBe(2);
      expect(trip!.establishment.area.length).toBeGreaterThanOrEqual(3);

      // Una factura ajena no sirve.
      const someoneElse = await receipt(s.staffId);
      expect(await trips.registerPurchase({ ...command(s, await refOf(s)), amount: '18500', receiptFileId: someoneElse })).toEqual({
        ok: false,
        reason: 'RECEIPT',
        status: 'AT_ESTABLISHMENT',
      });

      // Compra hecha hace 3 horas (sin señal): la hora estimada de listo ya pasó.
      const photo = await receipt(s.courierId);
      const purchasedAt = new Date(Date.now() - 3 * 60 * 60_000);
      const purchase = { ...command(s, await refOf(s), purchasedAt), offline: true, amount: '18500', receiptFileId: photo };
      expect(await trips.registerPurchase(purchase)).toEqual({ ok: true });
      expect(await statusOf(s.orderId)).toBe('PREPARING');
      // El mismo evento otra vez (reenvío de la cola): no repite nada.
      expect(await trips.registerPurchase({ ...purchase, trip: await refOf(s) })).toEqual({ ok: false, reason: 'STEP', status: 'PREPARING' });
      expect(await trips.replayedOrderCode(purchase.clientEventId)).toBe(s.orderCode);

      const [ledger] = await prisma.$queryRaw<{ amount: string; type: string; source: string; box_owner: string }[]>`
        SELECT m.amount::text AS amount, t.code AS type, b.courier_user_id AS box_owner,
               (SELECT src.code FROM order_status_history h JOIN status_change_sources src ON src.id = h.source_id
                WHERE h.client_event_id = ${purchase.clientEventId}::uuid) AS source
        FROM order_purchases op JOIN cash_movements m ON m.id = op.cash_movement_id
        JOIN cash_movement_types t ON t.id = m.movement_type_id JOIN cash_boxes b ON b.id = m.cash_box_id
        WHERE op.order_id = ${s.orderId}::uuid`;
      expect(ledger).toEqual({ amount: '18500.00', type: 'PURCHASE', source: 'OFFLINE_SYNC', box_owner: s.courierId });
      await expect(prisma.$executeRaw`UPDATE cash_movements SET amount = 1 WHERE order_id = ${s.orderId}::uuid`).rejects.toThrow();

      trip = await trips.active(s.courierId, 'es');
      expect(trip!.purchase).toEqual({ amount: '18500.00', receiptFileId: photo });
      expect(trip!.preparation!.startedAt.getTime()).toBe(purchasedAt.getTime());

      // Venció la hora estimada: un aviso al domiciliario, una sola vez.
      expect(await watch.notifyDue()).toBeGreaterThanOrEqual(1);
      const due = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications n JOIN notification_types t ON t.id = n.notification_type_id AND t.code = 'PREPARATION_TIME_REACHED'
        WHERE n.order_id = ${s.orderId}::uuid AND n.recipient_user_id = ${s.courierId}::uuid`;
      expect(due[0].n).toBe(1);
      await watch.notifyDue();
      const again = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications n JOIN notification_types t ON t.id = n.notification_type_id AND t.code = 'PREPARATION_TIME_REACHED'
        WHERE n.order_id = ${s.orderId}::uuid`;
      expect(again[0].n).toBe(1);

      // "Sigue en preparación": el cliente ve alta demanda y el próximo aviso queda recheck después.
      expect(await trips.reportDelay(command(s, await refOf(s)))).toEqual({ ok: true });
      const [prep] = await prisma.$queryRaw<{ is_delayed: boolean; gap: number }[]>`
        SELECT is_delayed, extract(epoch FROM next_check_at - (SELECT max(reported_at) FROM order_preparation_delays WHERE order_id = ${s.orderId}::uuid))::int AS gap
        FROM v_order_preparation WHERE order_id = ${s.orderId}::uuid`;
      expect(prep).toEqual({ is_delayed: true, gap: 300 });
      const mine = await orders.findMine(s.customerId, s.orderCode, 'es');
      expect(mine!.preparation!.delayed).toBe(true);
      expect(mine!.purchase).toEqual({ amount: '18500.00', receiptFileId: photo });
      // El cliente nunca recibe la ubicación del domiciliario.
      expect(JSON.stringify(mine)).not.toMatch(/courier|ping/i);

      // "Ya está listo": va en camino y ahora sí ve a dónde va y a quién llamar.
      // (Hace 30 s, para que las lecturas de la prueba sean posteriores a la salida.)
      expect(await trips.markReady(command(s, await refOf(s), new Date(Date.now() - 30_000)))).toEqual({ ok: true });
      trip = await trips.active(s.courierId, 'es');
      expect(trip!.destination).toMatchObject({ line: 'Calle 5 # 3-20', reference: 'Casa azul', recipientName: 'Cliente E08' });

      // A 300 m no está llegando; a 40 m sí (delivery.arriving_meters = 80).
      await ping(s.courierId, offset(s.home.lat, s.home.lng, -300), 2);
      expect(await probe.evaluate(s.courierId)).toBeNull();
      await ping(s.courierId, offset(s.home.lat, s.home.lng, -40), 1);
      expect(await probe.evaluate(s.courierId)).toEqual({ orderCode: s.orderCode, status: 'ARRIVING' });
    } finally {
      await finish(s);
    }
  });

  it('"Sigue en preparación" solo lo marca el domiciliario del pedido y solo en preparación', async () => {
    const s = await acceptedOrder();
    try {
      await expect(prisma.$executeRaw`
        INSERT INTO order_preparation_delays (order_id, reported_by_user_id) VALUES (${s.orderId}::uuid, ${s.courierId}::uuid)`).rejects.toThrow(/no está en preparación/);
      expect(await trips.reportDelay(command(s, await refOf(s)))).toEqual({ ok: false, reason: 'STEP', status: 'ACCEPTED' });
    } finally {
      await finish(s);
    }
  });
});

describe('Turno y modo cliente (H08.1, H08.7)', () => {
  it('con pedido en curso no deja el modo domiciliario; sin pedido, cambiar a cliente cierra el turno', async () => {
    const s = await acceptedOrder();
    const [session] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO sessions (user_id, active_role_id) VALUES (${s.courierId}::uuid, ${id('roles', 'COURIER')}) RETURNING id`;
    const toCustomer = () => prisma.$executeRaw`UPDATE sessions SET active_role_id = ${id('roles', 'CUSTOMER')} WHERE id = ${session.id}::uuid`;
    try {
      await expect(toCustomer()).rejects.toThrow(/COURIER_HAS_ACTIVE_ORDER/);
      await finish(s);
      await prisma.$executeRaw`INSERT INTO courier_availability_periods (courier_user_id) VALUES (${s.courierId}::uuid)`;
      await toCustomer();
      const open = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM v_open_availability WHERE courier_user_id = ${s.courierId}::uuid`;
      expect(open[0].n).toBe(0);
      expect(await desk.expectsLocation(s.courierId)).toBe(false);
    } finally {
      await prisma.$executeRaw`UPDATE sessions SET ended_at = now(), end_reason_id = ${id('session_end_reasons', 'SIGN_OUT')} WHERE id = ${session.id}::uuid`;
      if ((await statusOf(s.orderId)) !== 'CANCELLED') await finish(s);
    }
  });

  it('un turno sin ubicación por 15 minutos se cierra solo, terminando en la última lectura', async () => {
    const s = await acceptedOrder();
    await finish(s);
    const [period] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO courier_availability_periods (courier_user_id, started_at) VALUES (${s.courierId}::uuid, now() - interval '1 hour') RETURNING id`;
    await ping(s.courierId, s.store, 20 * 60);
    expect(await maintenance.closeIdleAvailability(15)).toBeGreaterThanOrEqual(1);
    const [row] = await prisma.$queryRaw<{ reason: string; minutes: number }[]>`
      SELECT r.code AS reason, round(extract(epoch FROM now() - p.ended_at) / 60)::int AS minutes
      FROM courier_availability_periods p JOIN availability_end_reasons r ON r.id = p.end_reason_id WHERE p.id = ${period.id}::uuid`;
    expect(row).toEqual({ reason: 'INACTIVITY_TIMEOUT', minutes: 20 });
  });
});
