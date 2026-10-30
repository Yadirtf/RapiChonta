import { randomInt, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { prismaAdapter } from '../../src/shared/infrastructure/prisma/prisma-adapter';
import { CatalogIds } from '../../src/shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { SettingsReader } from '../../src/shared/infrastructure/settings/settings.reader';
import { PrismaCourierTrips } from '../../src/modules/fulfillment/infrastructure/prisma-courier-trips';
import { PrismaGeofenceProbe } from '../../src/modules/fulfillment/infrastructure/prisma-geofence.probe';
import { PrismaPreparationWatch } from '../../src/modules/fulfillment/infrastructure/prisma-preparation.watch';
import { PrismaCustomerDeliveries } from '../../src/modules/fulfillment/infrastructure/prisma-customer-deliveries';
import { PrismaDeliveryReviewWatch } from '../../src/modules/fulfillment/infrastructure/prisma-delivery-review.watch';
import { PrismaOrdersRepository } from '../../src/modules/orders/infrastructure/prisma-orders.repository';
import { PrismaCourierDesk } from '../../src/modules/dispatch/infrastructure/prisma-courier-desk';
import { PrismaDispatchMaintenance } from '../../src/modules/dispatch/infrastructure/prisma-dispatch-maintenance';
import { TripRef } from '../../src/modules/fulfillment/domain/ports/courier-trips';
import { PrismaOrderAdjustments } from '../../src/modules/fulfillment/infrastructure/prisma-order-adjustments';
import { readOrderAdjustments } from '../../src/modules/fulfillment/infrastructure/adjustment-read';
import { rankSubstitutes } from '../../src/modules/fulfillment/domain/adjustments';
import { PrismaCourierCollections } from '../../src/modules/fulfillment/infrastructure/prisma-courier-collections';
import { PrismaDeskReader } from '../../src/modules/operations/infrastructure/prisma-desk.reader';
import { PrismaDeskActions } from '../../src/modules/operations/infrastructure/prisma-desk.actions';
import { PrismaCashBook } from '../../src/modules/cash/infrastructure/prisma-cash-book';
import { PrismaCashBoxReader } from '../../src/modules/cash/infrastructure/prisma-cash-box.reader';
import { amountDue } from '../../src/modules/cash/domain/settlement';

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
const customers = new PrismaCustomerDeliveries(service, ids);
const review = new PrismaDeliveryReviewWatch(service, ids);
const adjustments = new PrismaOrderAdjustments(service, ids);
const collections = new PrismaCourierCollections(service, ids);
const deskReader = new PrismaDeskReader(service, ids);
const deskActions = new PrismaDeskActions(service, ids);
const cashBook = new PrismaCashBook(service, ids);
const cashReader = new PrismaCashBoxReader(service);

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

/**
 * Pedido confirmado y aceptado por un domiciliario verificado, con turno abierto. `prepare` corre antes de la oferta
 * (E11: el modo de financiación del domiciliario y, si lo exige, la base de su caja).
 */
async function acceptedOrder(prepare?: (tx: Prisma.TransactionClient, courierId: string, staffId: string) => Promise<void>): Promise<Scenario> {
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
      await prepare?.(tx, courierId, staff.id);

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

/** Una foto de factura (o de entrega) subida por `userId`. */
async function receipt(userId: string, purpose = 'PURCHASE_RECEIPT'): Promise<string> {
  const [file] = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO files (purpose_id, storage_key, mime_type, size_bytes, sha256, uploaded_by_user_id)
    SELECT p.id, 'files/' || gen_random_uuid(), 'image/jpeg', 1000, ${randomUUID().replace(/-/g, '').padEnd(64, '0')}, ${userId}::uuid
    FROM file_purposes p WHERE p.code = ${purpose} RETURNING id`;
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

/** Una novedad abierta que pone el pedido en disputa, reportada por el cliente o el personal. */
async function openIncident(tx: Db, s: Scenario, reporterId: string) {
  const [incident] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO incidents (order_id, incident_type_id, reported_by_user_id, status_id)
    VALUES (${s.orderId}::uuid, ${id('incident_types', 'OTHER')}, ${reporterId}::uuid, ${id('incident_statuses', 'OPEN')}) RETURNING id`;
  await tx.$executeRaw`INSERT INTO incident_status_history (incident_id, to_status_id, changed_by_user_id) VALUES (${incident.id}::uuid, ${id('incident_statuses', 'OPEN')}, ${reporterId}::uuid)`;
}

/** Cierra como cancelada la novedad sin resolver del pedido, para poder sacarlo de la disputa. */
async function resolveIncidents(tx: Db, s: Scenario) {
  const open = await tx.$queryRaw<{ id: string; status_id: number }[]>`
    SELECT i.id, i.status_id FROM incidents i JOIN incident_statuses st ON st.id = i.status_id AND NOT st.is_terminal WHERE i.order_id = ${s.orderId}::uuid`;
  for (const incident of open) {
    await tx.$executeRaw`UPDATE incidents SET resolution_type_id = ${id('incident_resolution_types', 'RESOLVED_AS_CANCELLED')}, resolution_notes = 'Cierre de la prueba' WHERE id = ${incident.id}::uuid`;
    await tx.$executeRaw`
      INSERT INTO incident_status_history (incident_id, from_status_id, to_status_id, changed_by_user_id)
      VALUES (${incident.id}::uuid, ${incident.status_id}, ${id('incident_statuses', 'RESOLVED')}, ${s.staffId}::uuid)`;
  }
}

/** Deja el pedido en un estado terminal por un camino válido de la máquina de estados, y cierra los turnos. */
async function finish(s: Scenario) {
  const status = await statusOf(s.orderId);
  await prisma.$transaction(async (tx) => {
    let current = status;
    if (current === 'PREPARING') {
      await history(tx, s.orderId, 'PREPARING', 'ON_THE_WAY', s.courierId, 'COURIER');
      current = 'ON_THE_WAY';
    }
    if (current === 'ON_THE_WAY' || current === 'ARRIVING' || current === 'PENDING_REVIEW') {
      // Un pedido en disputa tiene su novedad abierta (E10): la abre el personal y lo pasa a DISPUTED.
      const byStaff = current === 'PENDING_REVIEW';
      await openIncident(tx, s, byStaff ? s.staffId : s.customerId);
      await history(tx, s.orderId, current, 'DISPUTED', byStaff ? s.staffId : s.customerId, byStaff ? 'OPERATOR' : 'CUSTOMER');
      current = 'DISPUTED';
    }
    if (current === 'DISPUTED') await resolveIncidents(tx, s);
    if (current !== 'CANCELLED' && current !== 'DELIVERED') {
      await tx.$executeRaw`
        UPDATE order_assignments SET released_at = clock_timestamp(), release_reason_id = ${id('assignment_release_reasons', 'ORDER_CANCELLED')}, released_by_user_id = ${s.staffId}::uuid
        WHERE order_id = ${s.orderId}::uuid AND released_at IS NULL`;
      await tx.$executeRaw`INSERT INTO order_cancellations (order_id, cancellation_reason_id) VALUES (${s.orderId}::uuid, ${id('cancellation_reasons', 'INCIDENT_RESOLUTION')})`;
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
      // El modo (COURIER_PURCHASE) es del pedido, no del domiciliario.
      expect(JSON.stringify({ ...mine, fulfillmentMode: undefined })).not.toMatch(/courier|ping/i);

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

/** Lo lleva hasta ON_THE_WAY por los pasos reales (compra y "ya está listo"), `minutesAgo` minutos atrás. */
async function onTheWay(s: Scenario, minutesAgo = 0) {
  await ping(s.courierId, s.store, 6);
  await ping(s.courierId, s.store, 3);
  await probe.evaluate(s.courierId);
  const at = (extra: number) => new Date(Date.now() - (minutesAgo + extra) * 60_000);
  expect(await trips.registerPurchase({ ...command(s, await refOf(s), at(10)), offline: true, amount: '18000', receiptFileId: await receipt(s.courierId) })).toEqual({ ok: true });
  expect(await trips.markReady({ ...command(s, await refOf(s), at(5)), offline: true })).toEqual({ ok: true });
}

const assignmentOf = async (s: Scenario) =>
  (
    await prisma.$queryRaw<{ released: boolean; reason: string | null }[]>`
      SELECT a.released_at IS NOT NULL AS released, r.code AS reason
      FROM order_assignments a LEFT JOIN assignment_release_reasons r ON r.id = a.release_reason_id
      WHERE a.order_id = ${s.orderId}::uuid`
  )[0];

const lastChange = async (s: Scenario) =>
  (
    await prisma.$queryRaw<{ to: string; source: string; role: string | null }[]>`
      SELECT ts.code AS to, src.code AS source, r.code AS role
      FROM order_status_history h JOIN order_statuses ts ON ts.id = h.to_status_id
      JOIN status_change_sources src ON src.id = h.source_id LEFT JOIN roles r ON r.id = h.acting_role_id
      WHERE h.order_id = ${s.orderId}::uuid ORDER BY h.recorded_at DESC LIMIT 1`
  )[0];

describe('Cierre de la entrega con código (E10)', () => {
  it('al salir nace el código; el cliente lo ve; "Llegué" y el código correcto lo entregan y liberan al domiciliario', async () => {
    const s = await acceptedOrder();
    try {
      await onTheWay(s);
      const mine = await orders.findMine(s.customerId, s.orderCode, 'es');
      expect(mine!.delivery.code).toMatch(/^\d{4}$/);
      const deliveryCode = mine!.delivery.code!;
      expect(await trips.active(s.courierId, 'es')).toMatchObject({ delivery: { arrivedAt: null, proofAvailableAt: null, codeAttemptsLeft: 5 } });

      // "Llegué" sin que la geocerca lo detecte: ARRIVING con el rol del domiciliario.
      expect(await trips.markArrived(command(s, await refOf(s)))).toEqual({ ok: true });
      expect(await lastChange(s)).toEqual({ to: 'ARRIVING', source: 'USER_ACTION', role: 'COURIER' });
      const arriving = await trips.active(s.courierId, 'es');
      expect(arriving!.delivery!.arrivedAt).not.toBeNull();
      // La foto se habilita a los 5 minutos (delivery.proof_after_seconds = 300).
      expect(arriving!.delivery!.proofAvailableAt!.getTime() - arriving!.delivery!.arrivedAt!.getTime()).toBe(300_000);

      // Un código equivocado queda guardado aunque el paso falle.
      const wrong = deliveryCode === '0000' ? '1111' : '0000';
      expect(await trips.deliverWithCode({ ...command(s, await refOf(s)), deliveryCode: wrong })).toEqual({ ok: false, reason: 'CODE', status: 'ARRIVING', attemptsLeft: 4 });
      expect((await trips.active(s.courierId, 'es'))!.delivery!.codeAttemptsLeft).toBe(4);

      expect(await trips.deliverWithCode({ ...command(s, await refOf(s)), deliveryCode })).toEqual({ ok: true });
      expect(await statusOf(s.orderId)).toBe('DELIVERED');
      expect(await lastChange(s)).toEqual({ to: 'DELIVERED', source: 'USER_ACTION', role: 'COURIER' });
      expect(await assignmentOf(s)).toEqual({ released: true, reason: 'ORDER_COMPLETED' });
      // Ya no lo lleva: puede recibir otro pedido; el cliente ya no ve el código.
      expect(await trips.active(s.courierId, 'es')).toBeNull();
      expect((await orders.findMine(s.customerId, s.orderCode, 'es'))!.delivery.code).toBeNull();
      // Tocar "Recibí" después no es un error ni cambia nada.
      expect(await customers.confirmReceived(s.customerId, s.orderCode)).toEqual({ ok: true, status: 'DELIVERED', changed: false });
    } finally {
      await finish(s);
    }
  });

  it('cinco códigos equivocados bloquean el código; la foto se habilita ya, libera al domiciliario y el cliente puede reclamar', async () => {
    const s = await acceptedOrder();
    try {
      await onTheWay(s);
      await ping(s.courierId, offset(s.home.lat, s.home.lng, -20), 1);
      expect(await probe.evaluate(s.courierId)).toEqual({ orderCode: s.orderCode, status: 'ARRIVING' });

      // Antes de los 5 minutos no hay foto.
      const early = await trips.deliverWithProof({ ...command(s, await refOf(s)), fileId: await receipt(s.courierId, 'DELIVERY_PROOF') });
      expect(early).toMatchObject({ ok: false, reason: 'PROOF_EARLY', status: 'ARRIVING' });

      const { code: real } = (await prisma.$queryRaw<{ code: string }[]>`SELECT code FROM order_delivery_codes WHERE order_id = ${s.orderId}::uuid`)[0];
      const wrong = real === '0000' ? '1111' : '0000';
      for (let left = 4; left >= 0; left--) {
        expect(await trips.deliverWithCode({ ...command(s, await refOf(s)), deliveryCode: wrong })).toMatchObject({ reason: 'CODE', attemptsLeft: left });
      }
      // Ni el correcto sirve ya.
      expect(await trips.deliverWithCode({ ...command(s, await refOf(s)), deliveryCode: real })).toEqual({ ok: false, reason: 'CODE_LOCKED', status: 'ARRIVING' });

      // Una foto de factura (u otra persona) no sirve como prueba de entrega.
      expect(await trips.deliverWithProof({ ...command(s, await refOf(s)), fileId: await receipt(s.courierId) })).toMatchObject({ reason: 'PROOF' });
      const photo = await receipt(s.courierId, 'DELIVERY_PROOF');
      expect(await trips.deliverWithProof({ ...command(s, await refOf(s)), fileId: photo })).toEqual({ ok: true });
      expect(await statusOf(s.orderId)).toBe('PENDING_REVIEW');
      expect(await assignmentOf(s)).toEqual({ released: true, reason: 'ORDER_COMPLETED' });
      const [file] = await prisma.$queryRaw<{ captured: boolean; located: boolean }[]>`
        SELECT captured_at IS NOT NULL AS captured, captured_location IS NOT NULL AS located FROM files WHERE id = ${photo}::uuid`;
      expect(file).toEqual({ captured: true, located: true });
      // El cliente recibe aviso y ve la foto y hasta cuándo puede reclamar.
      const notes = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications n WHERE n.order_id = ${s.orderId}::uuid AND n.recipient_user_id = ${s.customerId}::uuid
          AND n.created_at > now() - interval '1 minute'`;
      expect(notes[0].n).toBeGreaterThanOrEqual(1);
      const mine = await orders.findMine(s.customerId, s.orderCode, 'es');
      expect(mine!.delivery).toMatchObject({ code: null, proofFileId: photo });
      expect(mine!.delivery.reviewClosesAt!.getTime()).toBeGreaterThan(Date.now() + 7100_000);

      expect(await customers.reportNotReceived('00000000-0000-4000-8000-000000000000', s.orderCode, null)).toEqual({ ok: false, reason: 'NOT_FOUND' });
      expect(await customers.reportNotReceived(s.customerId, s.orderCode, 'No llegó nadie')).toEqual({ ok: true, status: 'DISPUTED', changed: true });
      expect(await lastChange(s)).toEqual({ to: 'DISPUTED', source: 'USER_ACTION', role: 'CUSTOMER' });
      expect(await customers.confirmReceived(s.customerId, s.orderCode)).toEqual({ ok: false, reason: 'STEP', status: 'DISPUTED' });
    } finally {
      await finish(s);
    }
  });

  it('una entrega con foto que nadie reclama se cierra sola como entregada (TIMER)', async () => {
    const s = await acceptedOrder();
    try {
      // Todo hace 3 horas (con la hora del teléfono, como desde la cola sin señal).
      await onTheWay(s, 180);
      expect(await trips.markArrived({ ...command(s, await refOf(s), new Date(Date.now() - 180 * 60_000)), offline: true })).toEqual({ ok: true });
      const photo = await receipt(s.courierId, 'DELIVERY_PROOF');
      expect(await trips.deliverWithProof({ ...command(s, await refOf(s), new Date(Date.now() - 170 * 60_000)), offline: true, fileId: photo })).toEqual({ ok: true });
      expect((await review.nextDueAt())!.getTime()).toBeLessThanOrEqual(Date.now());

      expect(await review.closeDue()).toBeGreaterThanOrEqual(1);
      expect(await statusOf(s.orderId)).toBe('DELIVERED');
      expect(await lastChange(s)).toEqual({ to: 'DELIVERED', source: 'TIMER', role: null });
    } finally {
      await finish(s);
    }
  });

  it('"Recibí mi pedido" mientras el domiciliario sigue asignado lo entrega y lo libera', async () => {
    const s = await acceptedOrder();
    try {
      await onTheWay(s);
      expect(await customers.confirmReceived(s.customerId, s.orderCode)).toEqual({ ok: true, status: 'DELIVERED', changed: true });
      expect(await lastChange(s)).toEqual({ to: 'DELIVERED', source: 'USER_ACTION', role: 'CUSTOMER' });
      expect(await assignmentOf(s)).toEqual({ released: true, reason: 'ORDER_COMPLETED' });
      // Un paso tardío del domiciliario (desde la cola) ya no aplica.
      expect(await trips.ref(s.courierId, s.orderCode)).toBeNull();
    } finally {
      await finish(s);
    }
  });
});

describe('Producto faltante en PostgreSQL (E09)', () => {
  /** Lleva el pedido al local (geocerca) y le agrega una segunda línea de otro producto del mismo local. */
  async function atStore(s: Scenario, secondLine: boolean) {
    await prisma.$transaction(async (tx) => {
      if (secondLine) {
        await tx.$executeRaw`
          INSERT INTO order_items (order_id, product_version_id, quantity)
          SELECT ${s.orderId}::uuid, m.product_version_id, 1 FROM v_menu m JOIN orders o ON o.establishment_id = m.establishment_id
          WHERE o.id = ${s.orderId}::uuid AND m.is_orderable
            AND m.product_id NOT IN (SELECT product_id FROM v_order_lines WHERE order_id = ${s.orderId}::uuid)
          ORDER BY m.price LIMIT 1`;
      }
      await history(tx, s.orderId, 'ACCEPTED', 'AT_ESTABLISHMENT', null, null, 'GEOFENCE');
    });
    return prisma.$queryRaw<{ id: string; price: string; quantity: number }[]>`
      SELECT order_item_id AS id, unit_price::text AS price, quantity::int AS quantity FROM v_order_lines WHERE order_id = ${s.orderId}::uuid ORDER BY unit_price DESC`;
  }
  const noticesOf = (s: Scenario, type: string) => prisma.$queryRaw<{ recipient: string }[]>`
    SELECT n.recipient_user_id AS recipient FROM notifications n JOIN notification_types t ON t.id = n.notification_type_id AND t.code = ${type}
    WHERE n.order_id = ${s.orderId}::uuid`;
  const itemsTotal = async (s: Scenario) =>
    Number((await prisma.$queryRaw<{ total: string }[]>`SELECT items_total::text AS total FROM v_order_amounts WHERE order_id = ${s.orderId}::uuid`)[0].total);

  it('consulta, decisiones y vuelta a la compra con el total recalculado (H09.2, H09.3)', async () => {
    const s = await acceptedOrder();
    try {
      const lines = await atStore(s, true);
      if (lines.length < 2) throw new Error('La semilla de ejemplo necesita al menos dos productos en el local');
      const [main, side] = lines;
      const newPrice = (Number(side.price) + 700).toFixed(2);
      expect(
        await trips.openAdjustment({
          ...command(s, await refOf(s)),
          lines: [
            { orderItemId: main.id, reason: 'UNAVAILABLE' },
            { orderItemId: side.id, reason: 'PRICE_CHANGED', unitPrice: newPrice },
          ],
        }),
      ).toEqual({ ok: true });
      expect(await statusOf(s.orderId)).toBe('AWAITING_CUSTOMER');
      expect(await noticesOf(s, 'ADJUSTMENT_REQUESTED')).toEqual([{ recipient: s.customerId }]);

      const [request] = await readOrderAdjustments(service, s.orderId, 'es');
      expect(request.open).toBe(true);
      expect(request.expiresAt.getTime() - request.reportedAt.getTime()).toBe(180_000);
      const lineOf = (itemId: string) => request.lines.find((l) => l.orderItemId === itemId)!;
      expect(lineOf(main.id).options).toEqual(['SUBSTITUTE', 'REMOVE_ITEM', 'CANCEL_ORDER']);
      expect(lineOf(side.id)).toMatchObject({ reason: 'PRICE_CHANGED', reportedUnitPrice: newPrice, options: ['SUBSTITUTE', 'REMOVE_ITEM', 'ACCEPT_PRICE', 'CANCEL_ORDER'] });

      // Con líneas pendientes el pedido no puede volver a la compra, ni abrirse otra consulta.
      await expect(prisma.$transaction((tx) => history(tx, s.orderId, 'AWAITING_CUSTOMER', 'AT_ESTABLISHMENT', s.customerId, 'CUSTOMER'))).rejects.toThrow(/Faltan decisiones/);

      const decide = (adjustmentId: string, decision: string, productVersionId?: string) =>
        adjustments.decide({ customerUserId: s.customerId, orderCode: s.orderCode, adjustmentId, decision, productVersionId });
      expect(await decide(lineOf(main.id).id, 'ACCEPT_PRICE')).toEqual({ ok: false, reason: 'OPTION', status: 'AWAITING_CUSTOMER' });
      expect(await adjustments.decide({ customerUserId: s.courierId, orderCode: s.orderCode, adjustmentId: lineOf(main.id).id, decision: 'REMOVE_ITEM' })).toEqual({
        ok: false,
        reason: 'NOT_FOUND',
      });

      expect(await decide(lineOf(side.id).id, 'ACCEPT_PRICE')).toEqual({ ok: true, status: 'AWAITING_CUSTOMER', resolved: false });
      expect(await decide(lineOf(side.id).id, 'REMOVE_ITEM')).toEqual({ ok: false, reason: 'DECIDED', status: 'AWAITING_CUSTOMER' });
      await expect(prisma.$executeRaw`UPDATE order_item_adjustments SET decided_at = now() WHERE id = ${lineOf(side.id).id}::uuid`).rejects.toThrow(/una vez/);

      const menu = (await adjustments.substitutes(s.customerId, s.orderCode, lineOf(main.id).id, 'es'))!;
      const [pick] = rankSubstitutes(menu.original, menu.candidates, menu.inOrder);
      if (pick) {
        expect(await decide(lineOf(main.id).id, 'SUBSTITUTE', pick.productVersionId)).toEqual({ ok: true, status: 'AT_ESTABLISHMENT', resolved: true });
        expect(await itemsTotal(s)).toBeCloseTo(Number(pick.price) * main.quantity + Number(newPrice) * side.quantity, 2);
        const [after] = await readOrderAdjustments(service, s.orderId, 'es');
        expect(after.lines.find((l) => l.orderItemId === main.id)).toMatchObject({ decision: 'SUBSTITUTE', substitute: { name: pick.name, quantity: main.quantity }, options: [] });
      } else {
        expect(await decide(lineOf(main.id).id, 'REMOVE_ITEM')).toEqual({ ok: true, status: 'AT_ESTABLISHMENT', resolved: true });
        expect(await itemsTotal(s)).toBeCloseTo(Number(newPrice) * side.quantity, 2);
      }
      expect(await lastChange(s)).toEqual({ to: 'AT_ESTABLISHMENT', source: 'USER_ACTION', role: 'CUSTOMER' });
      expect(await noticesOf(s, 'ADJUSTMENT_RESOLVED')).toEqual([{ recipient: s.courierId }]);
    } finally {
      await finish(s);
    }
  });

  it('si vence el tiempo se quita lo pendiente; si era lo único, el pedido se cancela y el domiciliario queda libre', async () => {
    const s = await acceptedOrder();
    try {
      const [line] = await atStore(s, false);
      // Una consulta de hace 3 minutos y medio (ya vencida), como la deja openAdjustment.
      await prisma.$transaction(async (tx) => {
        await history(tx, s.orderId, 'AT_ESTABLISHMENT', 'AWAITING_CUSTOMER', s.courierId, 'COURIER');
        const [request] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO order_adjustment_requests (order_id, reported_by_user_id, reported_at, expires_at)
          VALUES (${s.orderId}::uuid, ${s.courierId}::uuid, now() - interval '210 seconds', now() - interval '30 seconds') RETURNING id`;
        await tx.$executeRaw`
          INSERT INTO order_item_adjustments (request_id, order_id, order_item_id, reason_id)
          VALUES (${request.id}::uuid, ${s.orderId}::uuid, ${line.id}::uuid, ${id('adjustment_reasons', 'UNAVAILABLE')})`;
      });
      expect((await adjustments.nextDueAt())!.getTime()).toBeLessThanOrEqual(Date.now());
      expect(await adjustments.expireDue()).toBeGreaterThanOrEqual(1);

      expect(await statusOf(s.orderId)).toBe('CANCELLED');
      expect(await lastChange(s)).toEqual({ to: 'CANCELLED', source: 'TIMER', role: null });
      const [{ reason }] = await prisma.$queryRaw<{ reason: string }[]>`
        SELECT r.code AS reason FROM order_cancellations c JOIN cancellation_reasons r ON r.id = c.cancellation_reason_id WHERE c.order_id = ${s.orderId}::uuid`;
      expect(reason).toBe('ALL_ITEMS_UNAVAILABLE');
      expect(await assignmentOf(s)).toEqual({ released: true, reason: 'ORDER_CANCELLED' });
      expect(await noticesOf(s, 'TRIP_CANCELLED')).toEqual([{ recipient: s.courierId }]);
      const [request] = await readOrderAdjustments(service, s.orderId, 'es');
      expect(request).toMatchObject({ open: false, lines: [{ decision: 'EXPIRED_REMOVED', options: [] }] });
      expect(await adjustments.expireDue()).toBe(0);
    } finally {
      await finish(s);
    }
  });

  it('"Cancelar el pedido" responde por toda la consulta', async () => {
    const s = await acceptedOrder();
    try {
      const lines = await atStore(s, true);
      await trips.openAdjustment({ ...command(s, await refOf(s)), lines: lines.map((l) => ({ orderItemId: l.id, reason: 'UNAVAILABLE' as const })) });
      const [request] = await readOrderAdjustments(service, s.orderId, 'es');
      expect(await adjustments.decide({ customerUserId: s.customerId, orderCode: s.orderCode, adjustmentId: request.lines[0].id, decision: 'CANCEL_ORDER' })).toEqual({
        ok: true,
        status: 'CANCELLED',
        resolved: true,
      });
      const [after] = await readOrderAdjustments(service, s.orderId, 'es');
      expect(after.lines.every((l) => l.decision === 'CANCEL_ORDER')).toBe(true);
      expect(await lastChange(s)).toEqual({ to: 'CANCELLED', source: 'USER_ACTION', role: 'CUSTOMER' });
      expect(await assignmentOf(s)).toEqual({ released: true, reason: 'ORDER_CANCELLED' });
    } finally {
      await finish(s);
    }
  });
});

describe('Cobro, novedades y panel de pedidos (E10)', () => {
  const villagarzon = async () => (await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM municipalities WHERE dane_code = '86885'`)[0].id;
  const staff = (s: Scenario) => ({ userId: s.staffId, role: 'ADMIN' as const });
  const alertsOf = async (s: Scenario) => {
    const order = (await deskReader.board(await villagarzon(), 'ADMIN')).find((o) => o.code === s.orderCode);
    return order ? order.alerts.map((a) => a.code).sort() : null;
  };
  const noticesOf = (s: Scenario, type: string) => prisma.$queryRaw<{ recipient: string; variant: string | null; audience: string | null }[]>`
    SELECT n.recipient_user_id AS recipient, n.params->>'variant' AS variant, n.params->>'audience' AS audience
    FROM notifications n JOIN notification_types t ON t.id = n.notification_type_id AND t.code = ${type}
    WHERE n.order_id = ${s.orderId}::uuid ORDER BY n.created_at`;
  const totalOf = async (s: Scenario) =>
    (await prisma.$queryRaw<{ total: string }[]>`SELECT customer_total::text AS total FROM v_order_amounts WHERE order_id = ${s.orderId}::uuid`)[0].total;
  const nequiAccount = async (courierId: string) =>
    (
      await prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO courier_collection_accounts (courier_user_id, payment_method_id, account_number, holder_name)
        VALUES (${courierId}::uuid, ${id('payment_methods', 'NEQUI')}, '3001234567', 'Domiciliario E10') RETURNING id`
    )[0].id;
  /** Hasta PENDING_REVIEW: el código se bloquea y deja la foto de entrega. */
  async function withProof(s: Scenario) {
    await onTheWay(s);
    await ping(s.courierId, offset(s.home.lat, s.home.lng, -20), 1);
    await probe.evaluate(s.courierId);
    const { code: real } = (await prisma.$queryRaw<{ code: string }[]>`SELECT code FROM order_delivery_codes WHERE order_id = ${s.orderId}::uuid`)[0];
    for (let i = 0; i < 5; i++) await trips.deliverWithCode({ ...command(s, await refOf(s)), deliveryCode: real === '0000' ? '1111' : '0000' });
    expect(await trips.deliverWithProof({ ...command(s, await refOf(s)), fileId: await receipt(s.courierId, 'DELIVERY_PROOF') })).toEqual({ ok: true });
    expect(await statusOf(s.orderId)).toBe('PENDING_REVIEW');
  }

  it('H10.2: el cobro en dos medios va a la caja del día con la cuenta del domiciliario, una sola vez; si no cuadra, el panel lo marca', async () => {
    const s = await acceptedOrder();
    try {
      await onTheWay(s);
      const account = await nequiAccount(s.courierId);
      expect((await collections.methods(s.courierId)).find((m) => m.code === 'NEQUI')).toEqual({ code: 'NEQUI', isAccountBased: true, accountId: account });
      // Un medio de cuenta sin la cuenta que recibió el dinero no entra al libro.
      await expect(collections.record(s.courierId, s.orderCode, [{ paymentMethod: 'NEQUI', amount: '1000', collectionAccountId: null }], new Date())).rejects.toThrow();
      // Otro domiciliario no cobra un pedido ajeno.
      const stranger = await acceptedOrder();
      try {
        expect(await collections.record(stranger.courierId, s.orderCode, [{ paymentMethod: 'CASH', amount: '1000', collectionAccountId: null }], new Date())).toEqual({ ok: false, reason: 'NOT_FOUND' });
      } finally {
        await finish(stranger);
      }

      // Entregado con el código y sin cobro: queda pendiente para el domiciliario y el panel lo avisa.
      const { code: real } = (await prisma.$queryRaw<{ code: string }[]>`SELECT code FROM order_delivery_codes WHERE order_id = ${s.orderId}::uuid`)[0];
      expect(await trips.deliverWithCode({ ...command(s, await refOf(s)), deliveryCode: real })).toEqual({ ok: true });
      expect((await collections.pending(s.courierId)).map((p) => p.code)).toEqual([s.orderCode]);
      expect(await alertsOf(s)).toEqual(['COLLECTION_MISSING']);

      const total = Number(await totalOf(s));
      const payments = [
        { paymentMethod: 'CASH', amount: '10000', collectionAccountId: null },
        { paymentMethod: 'NEQUI', amount: String(total - 10000 - 500), collectionAccountId: account },
      ];
      expect(await collections.record(s.courierId, s.orderCode, payments, new Date())).toEqual({ ok: true, replayed: false });
      // Reenvío desde la cola sin señal: no se repite.
      expect(await collections.record(s.courierId, s.orderCode, payments, new Date())).toEqual({ ok: true, replayed: true });
      const [ledger] = await prisma.$queryRaw<{ n: number; total: string; accounts: number; same_box: boolean }[]>`
        SELECT count(*)::int AS n, sum(m.amount)::text AS total, count(m.collection_account_id)::int AS accounts,
               count(DISTINCT m.cash_box_id) = 1 AS same_box
        FROM cash_movements m JOIN cash_movement_types t ON t.id = m.movement_type_id AND t.code = 'COLLECTION'
        WHERE m.order_id = ${s.orderId}::uuid`;
      expect({ ...ledger, total: Number(ledger.total) }).toEqual({ n: 2, total: total - 500, accounts: 1, same_box: true });
      expect(await collections.pending(s.courierId)).toEqual([]);
      // Cobró $500 menos que el total: el panel lo marca para cuadrar la caja.
      expect(await alertsOf(s)).toEqual(['COLLECTION_MISMATCH']);
      const detail = (await deskReader.detail(s.orderCode, 'ADMIN'))!;
      expect(detail.collection!.payments.map((p) => p.paymentMethod)).toEqual(['CASH', 'NEQUI']);
      expect(detail.timeline.filter((e) => e.kind === 'COLLECTION')).toHaveLength(2);
      expect((await trips.active(s.courierId, 'es'))).toBeNull();
    } finally {
      await finish(s);
    }
  });

  it('H10.3 y H10.5: "No lo recibí" abre el caso y avisa al domiciliario; sin resolverlo no sale de la disputa; resuelto como entregado avisa a los dos', async () => {
    const s = await acceptedOrder();
    try {
      await withProof(s);
      expect(await alertsOf(s)).toEqual(['PROOF_REVIEW']);
      expect(await customers.reportNotReceived(s.customerId, s.orderCode, 'Nadie me tocó la puerta')).toEqual({ ok: true, status: 'DISPUTED', changed: true });
      expect((await noticesOf(s, 'INCIDENT_OPENED')).map((n) => n.recipient)).toEqual([s.courierId]);
      const board = (await deskReader.board(await villagarzon(), 'ADMIN')).find((o) => o.code === s.orderCode)!;
      expect(board.alerts.map((a) => a.code)).toEqual(['INCIDENT']);
      expect(board.incident).toMatchObject({ type: 'NOT_RECEIVED', status: 'OPEN', description: 'Nadie me tocó la puerta', reportedByRole: 'CUSTOMER', takenBy: null });
      expect((await orders.findMine(s.customerId, s.orderCode, 'es'))!.incident).toMatchObject({ status: 'OPEN', resolution: null });

      // La base no deja sacar el pedido de la disputa sin cerrar el caso, ni abrir un segundo caso.
      await expect(prisma.$transaction((tx) => history(tx, s.orderId, 'DISPUTED', 'DELIVERED', s.staffId, 'OPERATOR'))).rejects.toThrow();
      await expect(
        prisma.$executeRaw`INSERT INTO incidents (order_id, incident_type_id, reported_by_user_id, status_id)
          VALUES (${s.orderId}::uuid, ${id('incident_types', 'OTHER')}, ${s.customerId}::uuid, ${id('incident_statuses', 'OPEN')})`,
      ).rejects.toThrow();

      const incidentId = board.incident!.id;
      expect(await deskActions.takeIncident(staff(s), incidentId)).toEqual({ ok: true, status: 'DISPUTED' });
      expect(await deskActions.takeIncident(staff(s), incidentId)).toEqual({ ok: false, reason: 'CLOSED', status: 'IN_REVIEW' });
      expect((await deskReader.board(await villagarzon(), 'ADMIN')).find((o) => o.code === s.orderCode)!.incident!.takenBy).not.toBeNull();
      // Un caso que abre disputa debe dejar el pedido en algún estado.
      expect(await deskActions.resolveIncident(staff(s), incidentId, 'NO_ORDER_CHANGE', 'Sin cambio')).toEqual({ ok: false, reason: 'RESOLUTION' });
      expect(await deskActions.resolveIncident(staff(s), incidentId, 'RESOLVED_AS_DELIVERED', 'Llamé al cliente: lo recibió su hermana')).toEqual({ ok: true, status: 'DELIVERED' });
      expect(await deskActions.resolveIncident(staff(s), incidentId, 'RESOLVED_AS_DELIVERED', 'Otra vez')).toEqual({ ok: false, reason: 'CLOSED', status: 'RESOLVED' });

      expect(await statusOf(s.orderId)).toBe('DELIVERED');
      const resolved = await noticesOf(s, 'INCIDENT_RESOLVED');
      expect(resolved.map((n) => n.recipient).sort()).toEqual([s.customerId, s.courierId].sort());
      expect(new Set(resolved.map((n) => n.variant))).toEqual(new Set(['RESOLVED_AS_DELIVERED']));
      // Cada quien abre su pantalla al tocarlo: el cliente su pedido, el domiciliario su turno.
      expect(Object.fromEntries(resolved.map((n) => [n.recipient, n.audience]))).toEqual({ [s.customerId]: 'CUSTOMER', [s.courierId]: 'COURIER' });
      // El cliente no recibe además el aviso genérico de "entregado" al salir de la disputa.
      const [generic] = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications n JOIN order_status_history h ON h.id = n.order_status_history_id
        JOIN order_statuses f ON f.id = h.from_status_id AND f.code = 'DISPUTED' WHERE h.order_id = ${s.orderId}::uuid`;
      expect(generic.n).toBe(0);
      expect((await orders.findMine(s.customerId, s.orderCode, 'es'))!.incident).toMatchObject({ status: 'RESOLVED', resolution: 'RESOLVED_AS_DELIVERED' });

      const detail = (await deskReader.detail(s.orderCode, 'ADMIN'))!;
      expect(detail.proof).toMatchObject({ distanceMeters: expect.any(Number) });
      expect(detail.timeline.filter((e) => e.kind === 'INCIDENT').map((e) => (e as { status: string }).status)).toEqual(['OPEN', 'IN_REVIEW', 'RESOLVED']);
      expect(detail.timeline.at(-1)).toMatchObject({ kind: 'STATUS', to: 'DELIVERED', note: 'Llamé al cliente: lo recibió su hermana' });
      const [audit] = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM v_staff_activity WHERE actor_user_id = ${s.staffId}::uuid AND action IN ('INCIDENT_TAKEN', 'INCIDENT_RESOLVED')
          AND occurred_at > now() - interval '1 minute'`;
      expect(audit.n).toBeGreaterThanOrEqual(2);
    } finally {
      await finish(s);
    }
  });

  it('H10.5: la foto se aprueba, o se investiga y luego se cancela con el motivo INCIDENT_RESOLUTION', async () => {
    const approved = await acceptedOrder();
    try {
      await withProof(approved);
      expect(await deskActions.reviewProof(staff(approved), approved.orderCode, 'DELIVERED', 'Foto clara en la puerta', 'OTHER')).toEqual({ ok: true, status: 'DELIVERED' });
      expect(await lastChange(approved)).toEqual({ to: 'DELIVERED', source: 'USER_ACTION', role: 'ADMIN' });
      expect(await deskActions.reviewProof(staff(approved), approved.orderCode, 'DELIVERED', 'Otra vez', 'OTHER')).toEqual({ ok: false, reason: 'STEP', status: 'DELIVERED' });
    } finally {
      await finish(approved);
    }

    const s = await acceptedOrder();
    try {
      await withProof(s);
      // Solo un tipo que abre disputa sirve para investigar.
      expect(await deskActions.reviewProof(staff(s), s.orderCode, 'INVESTIGATE', 'La foto no muestra la casa', 'WRONG_ORDER')).toEqual({ ok: false, reason: 'TYPE' });
      expect(await deskActions.reviewProof(staff(s), s.orderCode, 'INVESTIGATE', 'La foto no muestra la casa', 'OTHER')).toEqual({ ok: true, status: 'DISPUTED' });
      expect((await noticesOf(s, 'INCIDENT_OPENED')).map((n) => n.recipient)).toEqual([s.courierId]);
      const incident = (await deskReader.board(await villagarzon(), 'ADMIN')).find((o) => o.code === s.orderCode)!.incident!;
      expect(incident).toMatchObject({ status: 'IN_REVIEW', reportedByRole: 'STAFF' });
      expect(await deskActions.resolveIncident(staff(s), incident.id, 'RESOLVED_AS_CANCELLED', 'El cliente no estaba; se devolvió')).toEqual({ ok: true, status: 'CANCELLED' });
      const [cancel] = await prisma.$queryRaw<{ reason: string; notes: string }[]>`
        SELECT r.code AS reason, c.notes FROM order_cancellations c JOIN cancellation_reasons r ON r.id = c.cancellation_reason_id WHERE c.order_id = ${s.orderId}::uuid`;
      expect(cancel).toEqual({ reason: 'INCIDENT_RESOLUTION', notes: 'El cliente no estaba; se devolvió' });
      expect((await orders.findMine(s.customerId, s.orderCode, 'es'))!.cancellationReason).toBe('INCIDENT_RESOLUTION');
    } finally {
      await finish(s);
    }
  });

  it('H10.5: el personal cancela antes de la compra con un motivo propio y un comentario, y el domiciliario queda libre', async () => {
    const s = await acceptedOrder();
    try {
      const reasons = await deskReader.cancellationReasons();
      expect(reasons).not.toContain('INCIDENT_RESOLUTION');
      expect((await deskReader.board(await villagarzon(), 'ADMIN')).find((o) => o.code === s.orderCode)!.cancellable).toBe(true);
      expect(await deskActions.cancel(staff(s), s.orderCode, 'INCIDENT_RESOLUTION', 'Prueba')).toEqual({ ok: false, reason: 'REASON' });
      expect(await deskActions.cancel(staff(s), s.orderCode, reasons[0], 'El local cerró antes de tiempo')).toEqual({ ok: true, status: 'CANCELLED' });
      expect(await assignmentOf(s)).toEqual({ released: true, reason: 'ORDER_CANCELLED' });
      expect((await noticesOf(s, 'TRIP_CANCELLED')).map((n) => n.recipient)).toEqual([s.courierId]);
      expect(await deskActions.cancel(staff(s), s.orderCode, reasons[0], 'Otra vez')).toEqual({ ok: false, reason: 'STEP', status: 'CANCELLED' });
    } finally {
      await finish(s);
    }

    // Ya comprado no se cancela desde aquí.
    const bought = await acceptedOrder();
    try {
      await onTheWay(bought);
      expect((await deskReader.board(await villagarzon(), 'ADMIN')).find((o) => o.code === bought.orderCode)!.cancellable).toBe(false);
      expect(await deskActions.cancel(staff(bought), bought.orderCode, (await deskReader.cancellationReasons())[0], 'Ya no lo quiere')).toMatchObject({ ok: false, reason: 'STEP' });
    } finally {
      await finish(bought);
    }
  });
});

/** E11: el modo de financiación desde hoy y, opcionalmente, la base de la caja de hoy. */
const withFunding = (mode: 'CASH_BOX' | 'OWN_FUNDS', base?: string) => async (tx: Prisma.TransactionClient, courierId: string, staffId: string) => {
  await tx.$executeRaw`
    INSERT INTO courier_funding_modes (courier_user_id, funding_mode_id, effective_on, created_by_user_id)
    VALUES (${courierId}::uuid, ${id('funding_modes', mode)}, current_date - 1, ${staffId}::uuid)`;
  if (!base) return;
  await tx.$executeRaw`
    INSERT INTO cash_movements (cash_box_id, movement_type_id, amount, payment_method_id, created_by_user_id)
    SELECT fn_courier_open_cash_box(${courierId}::uuid, d.business_date), ${id('cash_movement_types', 'OPENING')}, ${base}::numeric,
           ${id('payment_methods', 'CASH')}, ${staffId}::uuid
    FROM v_courier_business_day d WHERE d.courier_user_id = ${courierId}::uuid`;
};

const readiness = async (courierId: string) =>
  (await prisma.$queryRaw<{ ready: boolean; box: string | null }[]>`
    SELECT can_receive_offers AS ready, cash_box_id AS box FROM v_courier_cash_readiness WHERE courier_user_id = ${courierId}::uuid`)[0];

/** Del local a la puerta y entregado con el código: libera al domiciliario. */
async function deliver(s: Scenario) {
  await onTheWay(s);
  const deliveryCode = (await orders.findMine(s.customerId, s.orderCode, 'es'))!.delivery.code!;
  expect(await trips.markArrived(command(s, await refOf(s)))).toEqual({ ok: true });
  expect(await trips.deliverWithCode({ ...command(s, await refOf(s)), deliveryCode })).toEqual({ ok: true });
}

describe('Cajas diarias y comisiones (E11)', () => {
  it('H11.1: con modo CASH_BOX y sin base no recibe ofertas', async () => {
    await expect(acceptedOrder(withFunding('CASH_BOX'))).rejects.toThrow(/CASH_BOX_NOT_READY/);
  });

  it('H11.1–H11.3: base, compra, cobro y comisión cuadran; el cierre exige nota con diferencia y deja la caja solo para ajustes', async () => {
    const s = await acceptedOrder(withFunding('CASH_BOX', '50000'));
    try {
      const day = (await cashReader.courierDay(s.courierId))!;
      expect(day).toMatchObject({ fundingMode: 'CASH_BOX', requiresOpening: true, canReceiveOffers: true });
      const boxId = day.boxId!;
      // Una sola base por caja.
      expect(await cashBook.open({ courierUserId: s.courierId, businessDate: day.today, amount: '1000', paymentMethod: 'CASH', note: null, actorUserId: s.staffId })).toEqual({
        ok: false,
        reason: 'ALREADY_OPENED',
      });

      await onTheWay(s);
      // Con el pedido en curso no se cierra el día.
      expect(await cashBook.close({ boxId, received: [], notes: 'cierre temprano', actorUserId: s.staffId })).toEqual({ ok: false, reason: 'BUSY' });
      const deliveryCode = (await orders.findMine(s.customerId, s.orderCode, 'es'))!.delivery.code!;
      expect(await trips.markArrived(command(s, await refOf(s)))).toEqual({ ok: true });
      expect(await trips.deliverWithCode({ ...command(s, await refOf(s)), deliveryCode })).toEqual({ ok: true });
      const [{ total }] = await prisma.$queryRaw<{ total: string }[]>`SELECT customer_total::text AS total FROM v_order_amounts WHERE order_id = ${s.orderId}::uuid`;
      expect(await collections.record(s.courierId, s.orderCode, [{ paymentMethod: 'CASH', amount: total, collectionAccountId: null }], new Date())).toEqual({ ok: true, replayed: false });

      // Base 50.000 − compra 18.000 + cobro (productos + tarifa 3.000) − tarifa + comisión 15 % (450). Si la factura del
      // local fue menor que el menú, esa diferencia también la entrega: debe = base + productos − compra + comisión.
      const box = (await cashReader.detail(boxId))!;
      expect(box.movements.map((m) => m.type)).toEqual(['OPENING', 'PURCHASE', 'COLLECTION']);
      expect(box.orders).toHaveLength(1);
      expect(box.commissions).toBe('450.00');
      const due = (Number(total) - 3000 - 18000 + 50000 + 450).toFixed(2);
      expect(box.amountDue).toBe(due);
      // El desglose (Pesos) y la vista de la base dicen lo mismo.
      expect(amountDue(box.totals, box.courierFees, box.commissions).amountDue).toBe(box.amountDue);
      expect((await cashReader.board(box.municipalityId!, day.today)).find((r) => r.courierUserId === s.courierId)).toMatchObject({
        fundingMode: 'CASH_BOX',
        busy: false,
        canReceiveOffers: true,
        box: { id: boxId, state: 'OPEN', opening: '50000.00', amountDue: due, settledOrders: 1 },
      });

      // Entrega 450 menos de lo debido: con diferencia, sin nota no cierra (y nada queda a medias).
      const received = [{ paymentMethod: 'CASH', amount: (Number(due) - 450).toFixed(2) }];
      expect(await cashBook.close({ boxId, received, notes: null, actorUserId: s.staffId })).toEqual({ ok: false, reason: 'NOTE' });
      expect((await cashReader.detail(boxId))!.movements).toHaveLength(3);
      expect(await cashBook.close({ boxId, received, notes: 'La comisión la trae mañana', actorUserId: s.staffId })).toEqual({ ok: true });
      expect(await cashBook.close({ boxId, received: [], notes: 'otra vez', actorUserId: s.staffId })).toEqual({ ok: false, reason: 'CLOSED' });
      const closed = (await cashReader.detail(boxId))!;
      expect(closed).toMatchObject({ state: 'CLOSED', amountDue: '450.00', closure: { notes: 'La comisión la trae mañana' } });
      // Cerrada: termina la jornada (no recibe ofertas) y solo admite ajustes.
      expect(await readiness(s.courierId)).toEqual({ ready: false, box: boxId });
      expect(await cashBook.open({ courierUserId: s.courierId, businessDate: day.today, amount: '1000', paymentMethod: 'CASH', note: null, actorUserId: s.staffId })).toEqual({
        ok: false,
        reason: 'CLOSED',
      });
      const returned = closed.movements.find((m) => m.type === 'RETURN')!;
      // Un ajuste que no es contrario o no es por el mismo monto no anula; el correcto sí, y solo una vez.
      const back = returned.amount;
      expect(await cashBook.adjust({ boxId, direction: -1, amount: back, note: 'anula', reversesMovementId: returned.id, actorUserId: s.staffId })).toEqual({ ok: false, reason: 'REVERSAL' });
      expect(await cashBook.adjust({ boxId, direction: 1, amount: '1.00', note: 'anula', reversesMovementId: returned.id, actorUserId: s.staffId })).toEqual({ ok: false, reason: 'REVERSAL' });
      expect(await cashBook.adjust({ boxId, direction: 1, amount: back, note: '', reversesMovementId: returned.id, actorUserId: s.staffId })).toEqual({ ok: false, reason: 'NOTE' });
      expect(await cashBook.adjust({ boxId, direction: 1, amount: back, note: 'Billetes falsos', reversesMovementId: returned.id, actorUserId: s.staffId })).toMatchObject({ ok: true });
      expect(await cashBook.adjust({ boxId, direction: 1, amount: back, note: 'Otra vez', reversesMovementId: returned.id, actorUserId: s.staffId })).toEqual({ ok: false, reason: 'REVERSAL' });
      expect((await cashReader.detail(boxId))!.amountDue).toBe(due);

      // Un movimiento tardío del día cerrado cae en la caja siguiente; el libro y el cierre no se editan.
      const [next] = await prisma.$queryRaw<{ id: string }[]>`SELECT fn_courier_open_cash_box(${s.courierId}::uuid, ${day.today}::date) AS id`;
      const [late] = await prisma.$queryRaw<{ date: string }[]>`SELECT business_date::text AS date FROM cash_boxes WHERE id = ${next.id}::uuid`;
      expect(late.date > day.today).toBe(true);
      await expect(prisma.$executeRaw`DELETE FROM cash_box_closures WHERE cash_box_id = ${boxId}::uuid`).rejects.toThrow();
      await expect(prisma.$executeRaw`UPDATE cash_movements SET amount = 1 WHERE id = ${returned.id}::uuid`).rejects.toThrow();
    } finally {
      await finish(s);
    }
  });

  it('OWN_FUNDS: sin base, recibe ofertas; lo que debe es la comisión, y la base no aplica', async () => {
    const s = await acceptedOrder(withFunding('OWN_FUNDS'));
    try {
      await deliver(s);
      const [{ total }] = await prisma.$queryRaw<{ total: string }[]>`SELECT customer_total::text AS total FROM v_order_amounts WHERE order_id = ${s.orderId}::uuid`;
      await collections.record(s.courierId, s.orderCode, [{ paymentMethod: 'CASH', amount: total, collectionAccountId: null }], new Date());
      const day = (await cashReader.courierDay(s.courierId))!;
      expect(day).toMatchObject({ fundingMode: 'OWN_FUNDS', requiresOpening: false, canReceiveOffers: true });
      // Solo la comisión (450), más lo que la factura del local haya salido por debajo del menú.
      const due = (Number(total) - 3000 - 18000 + 450).toFixed(2);
      expect((await cashReader.detail(day.boxId!))!.amountDue).toBe(due);
      expect(await cashBook.open({ courierUserId: s.courierId, businessDate: day.today, amount: '1000', paymentMethod: 'CASH', note: null, actorUserId: s.staffId })).toEqual({
        ok: false,
        reason: 'NO_BASE_MODE',
      });
      expect(await cashBook.close({ boxId: day.boxId!, received: [{ paymentMethod: 'CASH', amount: due }], notes: null, actorUserId: s.staffId })).toEqual({ ok: true });
      expect((await cashReader.detail(day.boxId!))!.amountDue).toBe('0.00');
    } finally {
      await finish(s);
    }
  });
});
