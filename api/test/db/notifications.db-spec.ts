import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaNotificationOutbox } from '../../src/modules/notifications/infrastructure/persistence/prisma-notification-outbox';
import { CatalogIds } from '../../src/shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';

/**
 * Reglas de E06 que garantiza PostgreSQL (Docs/14-base-de-datos/E06-notificaciones.md).
 * Requieren una base migrada y con la semilla (SEED_DEMO_DATA para tener productos).
 */
const prisma = new PrismaClient();
class Rollback extends Error {}
type Tx = Prisma.TransactionClient;

async function inTransaction(work: (tx: Tx) => Promise<void>): Promise<void> {
  await prisma
    .$transaction(
      async (tx) => {
        await work(tx);
        throw new Rollback();
      },
      { timeout: 30_000 },
    )
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

async function expectDbError(tx: Tx, work: () => Promise<unknown>, pattern: RegExp) {
  await tx.$executeRaw`SAVEPOINT expect_error`;
  await expect(work()).rejects.toThrow(pattern);
  await tx.$executeRaw`ROLLBACK TO SAVEPOINT expect_error`;
}

const id = (table: string, code: string) => Prisma.sql`(SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE code = ${code})`;

/** Cliente con un pedido recién hecho, un operador y un dispositivo con sesión abierta. */
async function scenario(tx: Tx) {
  const [staff] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users LIMIT 1`;
  const [person] = await tx.$queryRaw<{ id: string }[]>`INSERT INTO people (given_names) VALUES ('Cliente E06') RETURNING id`;
  const [customer] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO users (person_id, status_id) VALUES (${person.id}::uuid, ${id('user_statuses', 'ACTIVE')}) RETURNING id`;
  await tx.$executeRaw`
    INSERT INTO user_status_history (user_id, to_status_id, changed_by_user_id) VALUES (${customer.id}::uuid, ${id('user_statuses', 'ACTIVE')}, ${staff.id}::uuid)`;
  await tx.$executeRaw`INSERT INTO user_preferences (user_id, language_id) VALUES (${customer.id}::uuid, ${id('languages', 'en')})`;
  const [product] = await tx.$queryRaw<{ establishment_id: string; version_id: string }[]>`
    SELECT p.establishment_id, v.id AS version_id FROM products p JOIN v_current_product_versions v ON v.product_id = p.id LIMIT 1`;
  if (!product) throw new Error('Cargue los datos de ejemplo (SEED_DEMO_DATA=true) antes de test:db');
  await tx.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE deactivated_at IS NULL`;
  const [zone] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO delivery_zones (municipality_id, zone_kind_id, zone_shape_id, name, area, sort_order, created_by_user_id)
    SELECT m.id, k.id, s.id, 'Zona prueba E06', ST_GeogFromText('SRID=4326;POLYGON((-76.7 0.9, -76.5 0.9, -76.5 1.1, -76.7 1.1, -76.7 0.9))'), 99, ${staff.id}::uuid
    FROM municipalities m, zone_kinds k, zone_shapes s WHERE m.dane_code = '86885' AND k.code = 'RURAL' AND s.code = 'POLYGON' RETURNING id`;
  const [fee] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO delivery_zone_fees (delivery_zone_id, amount, created_by_user_id) VALUES (${zone.id}::uuid, 3000, ${staff.id}::uuid) RETURNING id`;
  const [commission] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO commission_rates (municipality_id, rate, created_by_user_id) SELECT id, 0.15, ${staff.id}::uuid FROM municipalities WHERE dane_code = '86885' RETURNING id`;
  const [address] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO addresses (owner_user_id, reference, location)
    VALUES (${customer.id}::uuid, 'Casa azul', ST_SetSRID(ST_MakePoint(-76.6165, 1.0294), 4326)::geography) RETURNING id`;
  const [order] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO orders (code, customer_user_id, establishment_id, delivery_address_id, delivery_zone_fee_id, commission_rate_id,
                        payment_method_id, fulfillment_mode_id, status_id)
    VALUES ('RC-E06A', ${customer.id}::uuid, ${product.establishment_id}::uuid, ${address.id}::uuid, ${fee.id}::uuid, ${commission.id}::uuid,
            ${id('payment_methods', 'CASH')}, ${id('fulfillment_modes', 'COURIER_PURCHASE')}, ${id('order_statuses', 'PENDING_ASSIGNMENT')})
    RETURNING id`;
  await tx.$executeRaw`INSERT INTO order_items (order_id, product_version_id, quantity) VALUES (${order.id}::uuid, ${product.version_id}::uuid, 1)`;
  const [device] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO devices (installation_id, platform_id) VALUES (gen_random_uuid(), ${id('platforms', 'ANDROID')}) RETURNING id`;
  const [session] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO sessions (user_id, active_role_id, device_id) VALUES (${customer.id}::uuid, ${id('roles', 'CUSTOMER')}, ${device.id}::uuid) RETURNING id`;
  await tx.$executeRaw`
    INSERT INTO refresh_tokens (session_id, token_hash, expires_at) VALUES (${session.id}::uuid, repeat('e', 64), now() + interval '30 days')`;
  return { staffId: staff.id, customerId: customer.id, orderId: order.id, deviceId: device.id, sessionId: session.id };
}

const history = (tx: Tx, orderId: string, from: string | null, to: string, userId: string | null, role: string | null, source = 'USER_ACTION') => tx.$executeRaw`
  INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id)
  VALUES (${orderId}::uuid, ${from ? id('order_statuses', from) : null}, ${id('order_statuses', to)}, ${userId}::uuid,
          ${role ? id('roles', role) : null}, ${id('status_change_sources', source)})`;

const addToken = (tx: Tx, deviceId: string, token: string, provider = 'FCM') => tx.$executeRaw`
  INSERT INTO device_push_tokens (device_id, push_provider_id, token) VALUES (${deviceId}::uuid, ${id('push_providers', provider)}, ${token})`;

const notified = (tx: Tx, orderId: string) => tx.$queryRaw<{ status: string }[]>`
  SELECT s.code AS status FROM notifications n
  JOIN order_status_history h ON h.id = n.order_status_history_id JOIN order_statuses s ON s.id = h.to_status_id
  WHERE n.order_id = ${orderId}::uuid ORDER BY n.created_at`;

/** El repositorio de la bandeja de salida sobre la transacción de la prueba. */
const outboxOn = (tx: Tx) => {
  const client = tx as unknown as PrismaService;
  return new PrismaNotificationOutbox(client, new CatalogIds(client));
};

afterAll(() => prisma.$disconnect());

describe('Notificaciones en PostgreSQL', () => {
  it('cada cambio de estado que avisa crea un aviso en la misma transacción; no se avisa lo que hace el propio cliente', async () => {
    await inTransaction(async (tx) => {
      const s = await scenario(tx);
      await history(tx, s.orderId, null, 'PENDING_ASSIGNMENT', s.customerId, 'CUSTOMER');
      await history(tx, s.orderId, 'PENDING_ASSIGNMENT', 'OFFERED', s.staffId, 'OPERATOR');
      await history(tx, s.orderId, 'OFFERED', 'ACCEPTED', s.staffId, 'COURIER');
      await history(tx, s.orderId, 'ACCEPTED', 'AT_ESTABLISHMENT', null, null, 'GEOFENCE');
      await history(tx, s.orderId, 'AT_ESTABLISHMENT', 'PREPARING', s.staffId, 'COURIER');
      await history(tx, s.orderId, 'PREPARING', 'ON_THE_WAY', s.staffId, 'COURIER');
      await history(tx, s.orderId, 'ON_THE_WAY', 'ARRIVING', null, null, 'GEOFENCE');
      // El cliente confirma que recibió: es él quien lo hace, no se le avisa.
      await history(tx, s.orderId, 'ARRIVING', 'DELIVERED', s.customerId, 'CUSTOMER');
      expect((await notified(tx, s.orderId)).map((n) => n.status)).toEqual(['ACCEPTED', 'AT_ESTABLISHMENT', 'ON_THE_WAY', 'ARRIVING']);
    });
  });

  it('una cancelación del operador sí se avisa', async () => {
    await inTransaction(async (tx) => {
      const s = await scenario(tx);
      await history(tx, s.orderId, null, 'PENDING_ASSIGNMENT', s.customerId, 'CUSTOMER');
      await history(tx, s.orderId, 'PENDING_ASSIGNMENT', 'CANCELLED', s.staffId, 'OPERATOR');
      expect((await notified(tx, s.orderId)).map((n) => n.status)).toEqual(['CANCELLED']);
    });
  });

  it('un token vigente por dispositivo y proveedor, y el mismo token no queda vigente en dos dispositivos', async () => {
    await inTransaction(async (tx) => {
      const s = await scenario(tx);
      await addToken(tx, s.deviceId, 'fcm-token-1111111111');
      await addToken(tx, s.deviceId, 'hms-token-1111111111', 'HMS');
      await expectDbError(tx, () => addToken(tx, s.deviceId, 'fcm-token-2222222222'), /device_push_tokens_one_active_idx|23505/);
      const [other] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO devices (installation_id, platform_id) VALUES (gen_random_uuid(), ${id('platforms', 'ANDROID')}) RETURNING id`;
      await expectDbError(tx, () => addToken(tx, other.id, 'fcm-token-1111111111'), /device_push_tokens_active_token_idx|23505/);
      await tx.$executeRaw`
        UPDATE device_push_tokens SET invalidated_at = now(), invalidation_reason_id = ${id('push_token_invalidation_reasons', 'REPLACED')}
        WHERE token = 'fcm-token-1111111111'`;
      await addToken(tx, other.id, 'fcm-token-1111111111');
      // La baja lleva motivo, es una sola vez y el token no se edita ni se borra.
      await expectDbError(tx, () => tx.$executeRaw`UPDATE device_push_tokens SET invalidated_at = now() WHERE token = 'hms-token-1111111111'`, /invalidation_check|23514/);
      await expectDbError(tx, () => tx.$executeRaw`UPDATE device_push_tokens SET token = 'otro-token-000000000' WHERE token = 'hms-token-1111111111'`, /solo se da de baja/);
      await expectDbError(tx, () => tx.$executeRaw`DELETE FROM device_push_tokens WHERE device_id = ${s.deviceId}::uuid`, /solo se da de baja/);
    });
  });

  it('la bandeja de salida toma cada aviso una vez, con el idioma, el pedido y los tokens de sesiones vivas', async () => {
    await inTransaction(async (tx) => {
      const s = await scenario(tx);
      await addToken(tx, s.deviceId, 'hms-token-3333333333', 'HMS');
      // Otro dispositivo del cliente con la sesión cerrada: no recibe.
      const [old] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO devices (installation_id, platform_id) VALUES (gen_random_uuid(), ${id('platforms', 'ANDROID')}) RETURNING id`;
      await tx.$executeRaw`
        INSERT INTO sessions (user_id, active_role_id, device_id, ended_at, end_reason_id)
        VALUES (${s.customerId}::uuid, ${id('roles', 'CUSTOMER')}, ${old.id}::uuid, now(), ${id('session_end_reasons', 'SIGN_OUT')})`;
      await addToken(tx, old.id, 'fcm-token-4444444444');
      await tx.$executeRaw`UPDATE notifications SET dispatched_at = now() WHERE dispatched_at IS NULL`;
      await history(tx, s.orderId, null, 'PENDING_ASSIGNMENT', s.customerId, 'CUSTOMER');
      await history(tx, s.orderId, 'PENDING_ASSIGNMENT', 'CANCELLED', s.staffId, 'OPERATOR');

      const outbox = outboxOn(tx);
      const [claimed, ...rest] = await outbox.claim(10, 1800);
      expect(rest).toEqual([]);
      expect(claimed).toMatchObject({
        recipientUserId: s.customerId,
        type: 'ORDER_STATUS_CHANGED',
        highPriority: true,
        language: 'en',
        orderCode: 'RC-E06A',
        status: 'CANCELLED',
        targets: [{ token: 'hms-token-3333333333', provider: 'HMS' }],
      });
      expect(await outbox.claim(10, 1800)).toEqual([]);

      const [deliveryId] = await outbox.queueAttempts(claimed.id, [claimed.targets[0].tokenId]);
      await outbox.finishAttempts([{ deliveryId, status: 'SENT', providerMessageId: 'r-1' }]);
      // Un intento da un solo paso: de en cola a su resultado.
      await expectDbError(tx, () => outbox.finishAttempts([{ deliveryId, status: 'FAILED', errorCode: 'X' }]), /una sola vez/);
      await outbox.invalidateTokens([claimed.targets[0].tokenId]);
      const [token] = await tx.$queryRaw<{ reason: string }[]>`
        SELECT r.code AS reason FROM device_push_tokens t JOIN push_token_invalidation_reasons r ON r.id = t.invalidation_reason_id
        WHERE t.id = ${claimed.targets[0].tokenId}::uuid`;
      expect(token.reason).toBe('REJECTED_BY_PROVIDER');
    });
  });

  it('los avisos viejos se marcan repartidos sin enviarse y un aviso solo se marca leído una vez', async () => {
    await inTransaction(async (tx) => {
      const s = await scenario(tx);
      await tx.$executeRaw`UPDATE notifications SET dispatched_at = now() WHERE dispatched_at IS NULL`;
      const [old] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO notifications (recipient_user_id, notification_type_id, order_id, created_at)
        VALUES (${s.customerId}::uuid, ${id('notification_types', 'INCIDENT_RESOLVED')}, ${s.orderId}::uuid, now() - interval '2 hours') RETURNING id`;
      expect(await outboxOn(tx).claim(10, 1800)).toEqual([]);
      const [row] = await tx.$queryRaw<{ dispatched: boolean }[]>`SELECT dispatched_at IS NOT NULL AS dispatched FROM notifications WHERE id = ${old.id}::uuid`;
      expect(row.dispatched).toBe(true);
      await tx.$executeRaw`UPDATE notifications SET read_at = now() WHERE id = ${old.id}::uuid`;
      await expectDbError(tx, () => tx.$executeRaw`UPDATE notifications SET read_at = now() + interval '1 minute' WHERE id = ${old.id}::uuid`, /una vez/);
      await expectDbError(tx, () => tx.$executeRaw`UPDATE notifications SET params = '{"x":1}' WHERE id = ${old.id}::uuid`, /una vez/);
      await expectDbError(tx, () => tx.$executeRaw`DELETE FROM notifications WHERE id = ${old.id}::uuid`, /una vez/);
    });
  });
});
