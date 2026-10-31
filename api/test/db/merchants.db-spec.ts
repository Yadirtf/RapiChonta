import { randomInt, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { prismaAdapter } from '../../src/shared/infrastructure/prisma/prisma-adapter';
import { CatalogIds } from '../../src/shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { PrismaMerchantDesk } from '../../src/modules/merchants/infrastructure/prisma-merchant-desk';
import { PrismaPartnerships } from '../../src/modules/merchants/infrastructure/prisma-partnerships';
import { PrismaCourierTrips } from '../../src/modules/fulfillment/infrastructure/prisma-courier-trips';
import { PrismaOrdersRepository } from '../../src/modules/orders/infrastructure/prisma-orders.repository';

/**
 * E15 en PostgreSQL (Docs/14-base-de-datos/E13-E15-fases-futuras.md): convenio, personal del comercio y el pedido
 * directo de punta a punta (el comercio acepta con su tiempo, el domiciliario recoge y paga lo del local). Al final el
 * convenio queda terminado y el pedido cancelado, para no dejar rastro en las demás pruebas.
 * Requiere la base migrada y la semilla con SEED_ADMIN_* y SEED_DEMO_DATA=true.
 */
const prisma = new PrismaClient({ adapter: prismaAdapter() });
const service = prisma as unknown as PrismaService;
const ids = new CatalogIds(service);
const desk = new PrismaMerchantDesk(service, ids);
const partnerships = new PrismaPartnerships(service);
const trips = new PrismaCourierTrips(service, ids);
const orders = new PrismaOrdersRepository(service, ids);

type Db = Prisma.TransactionClient | PrismaClient;

const id = (table: string, code: string) => Prisma.sql`(SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE code = ${code})`;
const code = () => `RC-${Array.from({ length: 6 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[randomInt(32)]).join('')}`;
const VILLAGARZON = Prisma.sql`(SELECT id FROM municipalities WHERE dane_code = '86885')`;

const history = (db: Db, orderId: string, from: string | null, to: string, userId: string | null, role: string | null, source = 'USER_ACTION') => db.$executeRaw`
  INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id)
  VALUES (${orderId}::uuid, ${from ? id('order_statuses', from) : null}, ${id('order_statuses', to)}, ${userId}::uuid,
          ${role ? id('roles', role) : null}, ${id('status_change_sources', source)})`;

const statusOf = async (orderId: string) =>
  (await prisma.$queryRaw<{ code: string }[]>`SELECT s.code FROM orders o JOIN order_statuses s ON s.id = o.status_id WHERE o.id = ${orderId}::uuid`)[0].code;

/** Un usuario activo con un rol (sin municipio si el rol no lo pide). */
async function user(name: string, role: string | null, staffId: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const [person] = await tx.$queryRaw<{ id: string }[]>`INSERT INTO people (given_names) VALUES (${name}) RETURNING id`;
    const [u] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO users (person_id, status_id) VALUES (${person.id}::uuid, ${id('user_statuses', 'ACTIVE')}) RETURNING id`;
    await tx.$executeRaw`INSERT INTO user_status_history (user_id, to_status_id, changed_by_user_id) VALUES (${u.id}::uuid, ${id('user_statuses', 'ACTIVE')}, ${staffId}::uuid)`;
    if (role === 'COURIER') {
      await tx.$executeRaw`INSERT INTO user_roles (user_id, role_id, municipality_id, granted_by_user_id) VALUES (${u.id}::uuid, ${id('roles', 'COURIER')}, ${VILLAGARZON}, ${staffId}::uuid)`;
      await tx.$executeRaw`INSERT INTO courier_profiles (user_id, verification_status_id, created_by_user_id) VALUES (${u.id}::uuid, ${id('courier_verification_statuses', 'PENDING')}, ${staffId}::uuid)`;
      await tx.$executeRaw`INSERT INTO courier_verification_history (courier_user_id, to_status_id, changed_by_user_id) VALUES (${u.id}::uuid, ${id('courier_verification_statuses', 'PENDING')}, ${staffId}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO courier_verification_history (courier_user_id, from_status_id, to_status_id, changed_by_user_id)
        VALUES (${u.id}::uuid, ${id('courier_verification_statuses', 'PENDING')}, ${id('courier_verification_statuses', 'VERIFIED')}, ${staffId}::uuid)`;
    } else if (role) {
      await tx.$executeRaw`INSERT INTO user_roles (user_id, role_id, granted_by_user_id) VALUES (${u.id}::uuid, ${id('roles', role)}, ${staffId}::uuid)`;
    }
    return u.id;
  });
}

interface World {
  staffId: string;
  establishmentId: string;
  versionId: string;
  feeId: string;
  commissionId: string;
  today: string;
}
let world: World;

beforeAll(async () => {
  const [staff] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT ur.user_id AS id FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.code = 'ADMIN' WHERE ur.revoked_at IS NULL LIMIT 1`;
  const [product] = await prisma.$queryRaw<{ establishment_id: string; version_id: string }[]>`
    SELECT p.establishment_id, v.id AS version_id
    FROM products p JOIN v_current_product_versions v ON v.product_id = p.id
    JOIN establishments e ON e.id = p.establishment_id AND e.municipality_id = ${VILLAGARZON}
    ORDER BY e.name DESC LIMIT 1`;
  if (!staff || !product) throw new Error('Cargue la semilla con SEED_ADMIN_* y SEED_DEMO_DATA=true antes de test:db');
  let [fee] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT f.id FROM v_current_zone_fees f JOIN delivery_zones z ON z.id = f.delivery_zone_id AND z.municipality_id = ${VILLAGARZON} AND z.deactivated_at IS NULL LIMIT 1`;
  if (!fee) {
    // Sin zonas en el municipio (base recién sembrada): una de prueba que se da de baja al terminar.
    const [zone] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO delivery_zones (municipality_id, zone_kind_id, zone_shape_id, name, area, sort_order, created_by_user_id)
      SELECT ${VILLAGARZON}, k.id, s.id, 'Zona prueba E15', ST_GeogFromText('SRID=4326;POLYGON((-76.7 0.9, -76.5 0.9, -76.5 1.1, -76.7 1.1, -76.7 0.9))'), 97, ${staff.id}::uuid
      FROM zone_kinds k, zone_shapes s WHERE k.code = 'URBAN' AND s.code = 'POLYGON' RETURNING id`;
    [fee] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO delivery_zone_fees (delivery_zone_id, amount, created_by_user_id) VALUES (${zone.id}::uuid, 3000, ${staff.id}::uuid) RETURNING id`;
  }
  const [commission] = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO commission_rates (municipality_id, rate, created_by_user_id) SELECT ${VILLAGARZON}, 0.15, ${staff.id}::uuid RETURNING id`;
  const view = await partnerships.view(product.establishment_id);
  world = { staffId: staff.id, establishmentId: product.establishment_id, versionId: product.version_id, feeId: fee.id, commissionId: commission.id, today: view!.establishment.today };
});

afterAll(async () => {
  // Sin convenio abierto: las demás pruebas (y la siguiente corrida) ven el local como de compra por RapiChonta.
  if (world) await partnerships.end({ establishmentId: world.establishmentId, endedOn: world.today, actorUserId: world.staffId });
  await prisma.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE name = 'Zona prueba E15' AND deactivated_at IS NULL`;
  await prisma.$disconnect();
});

/** Un pedido directo recién confirmado (nace en AWAITING_MERCHANT, como lo deja el checkout). */
async function directOrder(customerId: string, status = 'AWAITING_MERCHANT'): Promise<{ orderId: string; orderCode: string }> {
  return prisma.$transaction(async (tx) => {
    const [address] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO addresses (owner_user_id, line, location)
      VALUES (${customerId}::uuid, 'Calle 2 # 4-10', ST_SetSRID(ST_MakePoint(-76.6, 1.03), 4326)::geography) RETURNING id`;
    const orderCode = code();
    const [order] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO orders (code, customer_user_id, establishment_id, delivery_address_id, delivery_zone_fee_id, commission_rate_id,
                          payment_method_id, fulfillment_mode_id, status_id)
      VALUES (${orderCode}, ${customerId}::uuid, ${world.establishmentId}::uuid, ${address.id}::uuid, ${world.feeId}::uuid, ${world.commissionId}::uuid,
              ${id('payment_methods', 'CASH')}, ${id('fulfillment_modes', 'MERCHANT_DIRECT')}, ${id('order_statuses', status)})
      RETURNING id`;
    await tx.$executeRaw`INSERT INTO order_items (order_id, product_version_id, quantity) VALUES (${order.id}::uuid, ${world.versionId}::uuid, 3)`;
    await history(tx, order.id, null, status, customerId, 'CUSTOMER');
    return { orderId: order.id, orderCode };
  });
}

describe('Convenio y personal del comercio (H15.1)', () => {
  it('sin convenio vigente no hay pedido directo; con convenio sí, y no se firman dos a la vez', async () => {
    const customerId = await user('Cliente E15', 'CUSTOMER', world.staffId);
    await expect(directOrder(customerId)).rejects.toThrow(/convenio|aliado/i);

    expect(await partnerships.start({ establishmentId: world.establishmentId, startedOn: world.today, endedOn: null, agreementFileId: null, actorUserId: world.staffId })).toBeNull();
    expect(await partnerships.start({ establishmentId: world.establishmentId, startedOn: world.today, endedOn: null, agreementFileId: null, actorUserId: world.staffId })).toBe('ACTIVE');
    const view = await partnerships.view(world.establishmentId);
    expect(view!.current).toMatchObject({ startedOn: world.today, endedOn: null });

    // El pedido directo nace esperando al comercio: no puede nacer en el estado de la compra por RapiChonta.
    await expect(directOrder(customerId, 'PENDING_ASSIGNMENT')).rejects.toThrow();
    const order = await directOrder(customerId);
    expect(await statusOf(order.orderId)).toBe('AWAITING_MERCHANT');
    // El cliente lo ve con su recorrido propio: esperando al comercio y recogido, no comprado.
    const journeys = await orders.journeys();
    expect(journeys.MERCHANT_DIRECT[0]).toBe('AWAITING_MERCHANT');
    expect(journeys.MERCHANT_DIRECT).not.toContain('PREPARING');
    expect(journeys.COURIER_PURCHASE).not.toContain('AWAITING_MERCHANT');
  });

  it('solo quien tiene el rol MERCHANT atiende un local, una vez a la vez', async () => {
    const plain = await user('Sin rol E15', null, world.staffId);
    await expect(partnerships.addMember({ establishmentId: world.establishmentId, userId: plain, actorUserId: world.staffId })).rejects.toThrow(/MERCHANT/);
    const merchant = await user('Tendero E15', 'MERCHANT', world.staffId);
    expect(await partnerships.addMember({ establishmentId: world.establishmentId, userId: merchant, actorUserId: world.staffId })).toBeNull();
    expect(await partnerships.addMember({ establishmentId: world.establishmentId, userId: merchant, actorUserId: world.staffId })).toBe('STAFF_EXISTS');
    const view = await partnerships.view(world.establishmentId);
    const member = view!.members.find((m) => m.userId === merchant)!;
    expect(await desk.stores(merchant)).toEqual([expect.objectContaining({ id: world.establishmentId })]);

    expect(await partnerships.revokeMember({ establishmentId: world.establishmentId, staffId: member.staffId, actorUserId: world.staffId })).toBeNull();
    expect(await partnerships.revokeMember({ establishmentId: world.establishmentId, staffId: member.staffId, actorUserId: world.staffId })).toBe('STAFF_NOT_FOUND');
    expect(await desk.stores(merchant)).toEqual([]);
    expect(await desk.counter(merchant, world.establishmentId, 12)).toBeNull();
  });
});

describe('Pedido directo de punta a punta (H15.1 / H15.2)', () => {
  it('el comercio acepta con su tiempo, el domiciliario recoge y paga lo del local, y el comercio marca listo', async () => {
    const customerId = await user('Cliente directo E15', 'CUSTOMER', world.staffId);
    const merchant = await user('Tendera E15', 'MERCHANT', world.staffId);
    const outsider = await user('Otro comercio E15', 'MERCHANT', world.staffId);
    const courierId = await user('Domiciliario E15', 'COURIER', world.staffId);
    await partnerships.addMember({ establishmentId: world.establishmentId, userId: merchant, actorUserId: world.staffId });
    const order = await directOrder(customerId);
    const actor = { userId: merchant, role: 'MERCHANT' };
    try {
      // Llega al mostrador como "por aceptar"; otro comercio no lo ve ni lo toca.
      const counter = await desk.counter(merchant, world.establishmentId, 12);
      expect(counter!.find((o) => o.code === order.orderCode)).toMatchObject({ status: 'AWAITING_MERCHANT', acceptedAt: null, customerName: 'Cliente' });
      expect(await desk.accept({ userId: outsider, role: 'MERCHANT' }, order.orderCode, 15)).toEqual({ ok: false, reason: 'NOT_FOUND' });

      // Sin aceptación no se pasa al despacho, ni con el rol del comercio.
      await expect(history(prisma, order.orderId, 'AWAITING_MERCHANT', 'PENDING_ASSIGNMENT', merchant, 'MERCHANT')).rejects.toThrow();
      // El tiempo lo vuelve a exigir la base.
      await expect(prisma.$executeRaw`
        INSERT INTO merchant_order_acceptances (order_id, accepted_by_user_id, preparation_minutes) VALUES (${order.orderId}::uuid, ${merchant}::uuid, 0)`).rejects.toThrow();
      // Listo antes de aceptar no aplica.
      expect(await desk.markReady(actor, order.orderCode)).toEqual({ ok: false, reason: 'STEP', status: 'AWAITING_MERCHANT' });

      expect(await desk.accept(actor, order.orderCode, 25)).toEqual({ ok: true, status: 'PENDING_ASSIGNMENT' });
      expect(await desk.accept(actor, order.orderCode, 25)).toEqual({ ok: false, reason: 'STEP', status: 'PENDING_ASSIGNMENT' });
      const [notice] = await prisma.$queryRaw<{ status: string; mode: string }[]>`
        SELECT s.code AS status, fm.code AS mode FROM notifications n
        JOIN order_status_history h ON h.id = n.order_status_history_id JOIN order_statuses s ON s.id = h.to_status_id
        JOIN orders o ON o.id = n.order_id JOIN fulfillment_modes fm ON fm.id = o.fulfillment_mode_id
        WHERE n.order_id = ${order.orderId}::uuid AND n.recipient_user_id = ${customerId}::uuid`;
      expect(notice).toEqual({ status: 'PENDING_ASSIGNMENT', mode: 'MERCHANT_DIRECT' });
      const [eta] = await prisma.$queryRaw<{ minutes: number }[]>`
        SELECT round(extract(epoch FROM estimated_ready_at - accepted_at) / 60)::int AS minutes FROM v_merchant_order_preparation WHERE order_id = ${order.orderId}::uuid`;
      expect(eta.minutes).toBe(25);

      // El despacho lo asigna como cualquier otro y el domiciliario llega al local.
      await prisma.$transaction(async (tx) => {
        await history(tx, order.orderId, 'PENDING_ASSIGNMENT', 'OFFERED', world.staffId, 'OPERATOR');
        const [offer] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO order_offers (order_id, offer_mode_id, sent_by_user_id, expires_at)
          VALUES (${order.orderId}::uuid, ${id('offer_modes', 'SPECIFIC')}, ${world.staffId}::uuid, now() + interval '1 minute') RETURNING id`;
        await tx.$executeRaw`INSERT INTO order_offer_recipients (order_offer_id, courier_user_id, status_id) VALUES (${offer.id}::uuid, ${courierId}::uuid, ${id('offer_recipient_statuses', 'PENDING')})`;
        await tx.$executeRaw`UPDATE order_offer_recipients SET status_id = ${id('offer_recipient_statuses', 'ACCEPTED')}, responded_at = clock_timestamp() WHERE order_offer_id = ${offer.id}::uuid`;
        await tx.$executeRaw`INSERT INTO order_assignments (order_id, order_offer_id, courier_user_id) VALUES (${order.orderId}::uuid, ${offer.id}::uuid, ${courierId}::uuid)`;
        await history(tx, order.orderId, 'OFFERED', 'ACCEPTED', courierId, 'COURIER');
        await history(tx, order.orderId, 'ACCEPTED', 'AT_ESTABLISHMENT', null, null, 'GEOFENCE');
      });

      // Listo: avisa al domiciliario que lo lleva (una vez, aunque se toque dos veces).
      expect(await desk.markReady(actor, order.orderCode)).toEqual({ ok: true, status: 'AT_ESTABLISHMENT' });
      expect(await desk.markReady(actor, order.orderCode)).toEqual({ ok: true, status: 'AT_ESTABLISHMENT' });
      const [ready] = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications n JOIN notification_types t ON t.id = n.notification_type_id AND t.code = 'MERCHANT_ORDER_READY'
        WHERE n.order_id = ${order.orderId}::uuid AND n.recipient_user_id = ${courierId}::uuid`;
      expect(ready.n).toBe(1);

      const ref = (await trips.ref(courierId, order.orderCode))!;
      const command = { courierUserId: courierId, trip: ref, clientEventId: randomUUID(), occurredAt: new Date(), offline: false };
      // En el directo no se compra con factura ni se pasa por la preparación de la compra por RapiChonta.
      expect(await trips.registerPurchase({ ...command, amount: '1000', receiptFileId: randomUUID() })).toEqual({ ok: false, reason: 'STEP', status: 'AT_ESTABLISHMENT' });
      await expect(history(prisma, order.orderId, 'AT_ESTABLISHMENT', 'AWAITING_CUSTOMER', courierId, 'COURIER')).rejects.toThrow();

      expect(await trips.pickUp(command)).toEqual({ ok: true });
      expect(await statusOf(order.orderId)).toBe('ON_THE_WAY');
      const [paid] = await prisma.$queryRaw<{ amount: string; items: string; code: boolean }[]>`
        SELECT m.amount::text AS amount, a.items_total::text AS items,
               EXISTS (SELECT 1 FROM order_delivery_codes WHERE order_id = ${order.orderId}::uuid) AS code
        FROM cash_movements m JOIN cash_movement_types t ON t.id = m.movement_type_id AND t.code = 'PURCHASE'
        JOIN v_order_amounts a ON a.order_id = m.order_id
        WHERE m.order_id = ${order.orderId}::uuid`;
      expect(paid.amount).toBe(paid.items);
      expect(paid.code).toBe(true);

      // Ya salió del local: va a la columna de cerrados y "listo" ya no aplica.
      const after = (await desk.counter(merchant, world.establishmentId, 12))!.find((o) => o.code === order.orderCode)!;
      expect(after.pickedUpAt).not.toBeNull();
      expect(after.courier).toMatchObject({ givenNames: 'Domiciliario E15' });
      expect(await desk.markReady(actor, order.orderCode)).toEqual({ ok: false, reason: 'STEP', status: 'ON_THE_WAY' });
    } finally {
      await prisma.$transaction(async (tx) => {
        const status = await statusOf(order.orderId);
        if (status === 'ON_THE_WAY') {
          const [incident] = await tx.$queryRaw<{ id: string }[]>`
            INSERT INTO incidents (order_id, incident_type_id, reported_by_user_id, status_id)
            VALUES (${order.orderId}::uuid, ${id('incident_types', 'OTHER')}, ${customerId}::uuid, ${id('incident_statuses', 'OPEN')}) RETURNING id`;
          await tx.$executeRaw`INSERT INTO incident_status_history (incident_id, to_status_id, changed_by_user_id) VALUES (${incident.id}::uuid, ${id('incident_statuses', 'OPEN')}, ${customerId}::uuid)`;
          await history(tx, order.orderId, 'ON_THE_WAY', 'DISPUTED', customerId, 'CUSTOMER');
          await tx.$executeRaw`UPDATE incidents SET resolution_type_id = ${id('incident_resolution_types', 'RESOLVED_AS_CANCELLED')}, resolution_notes = 'Cierre de la prueba' WHERE id = ${incident.id}::uuid`;
          await tx.$executeRaw`
            INSERT INTO incident_status_history (incident_id, from_status_id, to_status_id, changed_by_user_id)
            VALUES (${incident.id}::uuid, ${id('incident_statuses', 'OPEN')}, ${id('incident_statuses', 'RESOLVED')}, ${world.staffId}::uuid)`;
          await tx.$executeRaw`
            UPDATE order_assignments SET released_at = clock_timestamp(), release_reason_id = ${id('assignment_release_reasons', 'ORDER_CANCELLED')}, released_by_user_id = ${world.staffId}::uuid
            WHERE order_id = ${order.orderId}::uuid AND released_at IS NULL`;
          await tx.$executeRaw`INSERT INTO order_cancellations (order_id, cancellation_reason_id) VALUES (${order.orderId}::uuid, ${id('cancellation_reasons', 'INCIDENT_RESOLUTION')})`;
          await history(tx, order.orderId, 'DISPUTED', 'CANCELLED', world.staffId, 'OPERATOR');
        }
      });
    }
  });

  it('el comercio rechaza con uno de sus motivos y el cliente recibe el aviso de cancelado', async () => {
    const customerId = await user('Cliente rechazo E15', 'CUSTOMER', world.staffId);
    const merchant = await user('Tendero rechazo E15', 'MERCHANT', world.staffId);
    await partnerships.addMember({ establishmentId: world.establishmentId, userId: merchant, actorUserId: world.staffId });
    const order = await directOrder(customerId);
    const actor = { userId: merchant, role: 'MERCHANT' };
    // Un motivo del operador no sirve: el comercio elige entre los suyos.
    expect(await desk.decline(actor, order.orderCode, 'CUSTOMER_UNREACHABLE', null)).toEqual({ ok: false, reason: 'REASON' });
    expect(await desk.declineReasons()).toContain('MERCHANT_OUT_OF_STOCK');
    expect(await desk.decline(actor, order.orderCode, 'MERCHANT_OUT_OF_STOCK', 'Se acabó el pan')).toEqual({ ok: true, status: 'CANCELLED' });
    expect(await statusOf(order.orderId)).toBe('CANCELLED');
    const [notice] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM notifications WHERE order_id = ${order.orderId}::uuid AND recipient_user_id = ${customerId}::uuid`;
    expect(notice.n).toBe(1);
    const closed = (await desk.counter(merchant, world.establishmentId, 12))!.find((o) => o.code === order.orderCode)!;
    expect(closed).toMatchObject({ terminal: true, cancellation: { reason: 'MERCHANT_OUT_OF_STOCK', byMerchant: true } });
  });

  it('abre y pausa el local desde el portal, sin publicarlo ni darlo de baja', async () => {
    const merchant = await user('Tendero horario E15', 'MERCHANT', world.staffId);
    await partnerships.addMember({ establishmentId: world.establishmentId, userId: merchant, actorUserId: world.staffId });
    const actor = { userId: merchant, role: 'MERCHANT' };
    const [before] = await prisma.$queryRaw<{ code: string }[]>`
      SELECT s.code FROM establishments e JOIN establishment_statuses s ON s.id = e.status_id WHERE e.id = ${world.establishmentId}::uuid`;
    expect(before.code).toBe('ACTIVE');
    try {
      expect(await desk.setOpen(actor, world.establishmentId, false)).toEqual({ ok: true, status: 'TEMPORARILY_CLOSED' });
      expect(await desk.setOpen(actor, world.establishmentId, false)).toEqual({ ok: true, status: 'TEMPORARILY_CLOSED' });
      expect(await desk.setOpen({ userId: world.staffId, role: 'MERCHANT' }, world.establishmentId, true)).toEqual({ ok: false, reason: 'NOT_FOUND' });
    } finally {
      expect(await desk.setOpen(actor, world.establishmentId, true)).toEqual({ ok: true, status: 'ACTIVE' });
    }
  });
});
