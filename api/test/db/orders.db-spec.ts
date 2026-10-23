import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { prismaAdapter } from '../../src/shared/infrastructure/prisma/prisma-adapter';

/**
 * Reglas de E04 que garantiza PostgreSQL (Docs/14-base-de-datos/E04-pedido-del-cliente.md).
 * Requieren una base migrada y con la semilla (y SEED_DEMO_DATA para tener productos):
 * `npm run prisma:deploy && npm run seed:dev && npm run test:db`.
 */
const prisma = new PrismaClient({ adapter: prismaAdapter() });
class Rollback extends Error {}
type Tx = Prisma.TransactionClient;

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

/** Escenario mínimo: cliente, zona con tarifa, comisión y un producto de un local de ejemplo. */
async function scenario(tx: Tx) {
  const [user] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users LIMIT 1`;
  const [product] = await tx.$queryRaw<{ establishment_id: string; version_id: string }[]>`
    SELECT p.establishment_id, v.id AS version_id FROM products p JOIN v_current_product_versions v ON v.product_id = p.id LIMIT 1`;
  if (!product) throw new Error('Cargue los datos de ejemplo (SEED_DEMO_DATA=true) antes de test:db');
  await tx.$executeRaw`UPDATE delivery_zones SET deactivated_at = now() WHERE deactivated_at IS NULL`;
  const [zone] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO delivery_zones (municipality_id, zone_kind_id, zone_shape_id, name, area, sort_order, created_by_user_id)
    SELECT m.id, k.id, s.id, 'Zona prueba E04', ST_GeogFromText('SRID=4326;POLYGON((-76.7 0.9, -76.5 0.9, -76.5 1.1, -76.7 1.1, -76.7 0.9))'), 1, ${user.id}::uuid
    FROM municipalities m, zone_kinds k, zone_shapes s WHERE m.dane_code = '86885' AND k.code = 'URBAN' AND s.code = 'POLYGON' RETURNING id`;
  const [fee] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO delivery_zone_fees (delivery_zone_id, amount, created_by_user_id) VALUES (${zone.id}::uuid, 3000, ${user.id}::uuid) RETURNING id`;
  const [commission] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO commission_rates (municipality_id, rate, created_by_user_id)
    SELECT id, 0.15, ${user.id}::uuid FROM municipalities WHERE dane_code = '86885' RETURNING id`;
  const [address] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO addresses (owner_user_id, label, reference, location)
    VALUES (${user.id}::uuid, 'Casa', 'Casa azul', ST_SetSRID(ST_MakePoint(-76.6165, 1.0294), 4326)::geography) RETURNING id`;
  return { userId: user.id, establishmentId: product.establishment_id, versionId: product.version_id, feeId: fee.id, commissionId: commission.id, addressId: address.id };
}

async function insertOrder(tx: Tx, s: Awaited<ReturnType<typeof scenario>>, code = 'RC-TEST') {
  const [order] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO orders (code, customer_user_id, establishment_id, delivery_address_id, delivery_zone_fee_id, commission_rate_id,
                        payment_method_id, fulfillment_mode_id, status_id)
    VALUES (${code}, ${s.userId}::uuid, ${s.establishmentId}::uuid, ${s.addressId}::uuid, ${s.feeId}::uuid, ${s.commissionId}::uuid,
            ${id('payment_methods', 'CASH')}, ${id('fulfillment_modes', 'COURIER_PURCHASE')}, ${id('order_statuses', 'PENDING_ASSIGNMENT')})
    RETURNING id`;
  return order.id;
}

const addItem = (tx: Tx, orderId: string, versionId: string, quantity = 2) =>
  tx.$executeRaw`INSERT INTO order_items (order_id, product_version_id, quantity) VALUES (${orderId}::uuid, ${versionId}::uuid, ${quantity})`;

const history = (tx: Tx, orderId: string, from: string | null, to: string, userId: string | null, role: string | null, source = 'USER_ACTION') => tx.$executeRaw`
  INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id)
  VALUES (${orderId}::uuid, ${from ? id('order_statuses', from) : null}, ${id('order_statuses', to)}, ${userId}::uuid,
          ${role ? id('roles', role) : null}, ${id('status_change_sources', source)})`;

/** Ejecuta ya los disparadores diferidos (los que corren al confirmar la transacción). */
const checkDeferred = (tx: Tx) => tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;

afterAll(() => prisma.$disconnect());

describe('Pedidos en PostgreSQL', () => {
  it('un pedido completo calcula sus montos en las vistas y el cliente ve "Buscando domiciliario"', async () => {
    await inTransaction(async (tx) => {
      const s = await scenario(tx);
      const orderId = await insertOrder(tx, s);
      await addItem(tx, orderId, s.versionId, 2);
      await history(tx, orderId, null, 'PENDING_ASSIGNMENT', s.userId, 'CUSTOMER');
      await checkDeferred(tx);
      const [amounts] = await tx.$queryRaw<{ items_total: string; delivery_fee: string; customer_total: string; commission_amount: string; price: string }[]>`
        SELECT a.items_total::text, a.delivery_fee::text, a.customer_total::text, a.commission_amount::text, v.price::text
        FROM v_order_amounts a, product_versions v WHERE a.order_id = ${orderId}::uuid AND v.id = ${s.versionId}::uuid`;
      expect(Number(amounts.items_total)).toBe(Number(amounts.price) * 2);
      expect(Number(amounts.customer_total)).toBe(Number(amounts.price) * 2 + 3000);
      expect(amounts.commission_amount).toBe('450.00');
      // OFFERED no es visible: el cliente sigue viendo PENDING_ASSIGNMENT.
      await history(tx, orderId, 'PENDING_ASSIGNMENT', 'OFFERED', s.userId, 'ADMIN');
      const [visible] = await tx.$queryRaw<{ status_code: string }[]>`SELECT status_code FROM v_order_customer_status WHERE order_id = ${orderId}::uuid`;
      expect(visible.status_code).toBe('PENDING_ASSIGNMENT');
    });
  });

  it('al confirmar exige productos y la primera fila del historial', async () => {
    await inTransaction(async (tx) => {
      const s = await scenario(tx);
      await tx.$executeRaw`SAVEPOINT sin_lineas`;
      const orderId = await insertOrder(tx, s, 'RC-SN01');
      await history(tx, orderId, null, 'PENDING_ASSIGNMENT', s.userId, 'CUSTOMER');
      await expect(checkDeferred(tx)).rejects.toThrow(/sin productos/);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT sin_lineas`;
      await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
      const other = await insertOrder(tx, s, 'RC-SN02');
      await addItem(tx, other, s.versionId);
      await expect(checkDeferred(tx)).rejects.toThrow(/sin la primera fila/);
    });
  });

  it('solo versiones del mismo local, cantidades válidas y códigos con el formato RC-XXXX', async () => {
    await inTransaction(async (tx) => {
      const s = await scenario(tx);
      const [foreign] = await tx.$queryRaw<{ id: string }[]>`
        SELECT v.id FROM product_versions v JOIN products p ON p.id = v.product_id WHERE p.establishment_id <> ${s.establishmentId}::uuid LIMIT 1`;
      const orderId = await insertOrder(tx, s);
      if (foreign) await expectDbError(tx, () => addItem(tx, orderId, foreign.id), /no es del establecimiento/);
      await expectDbError(tx, () => addItem(tx, orderId, s.versionId, 100), /order_items_quantity_check|23514/);
      await expectDbError(tx, () => insertOrder(tx, s, 'RC-OIL0'), /orders_code_check|23514/);
    });
  });

  it('cada cambio de estado lo hace quien tiene el rol, y el pedido no se edita por fuera', async () => {
    await inTransaction(async (tx) => {
      const s = await scenario(tx);
      const orderId = await insertOrder(tx, s);
      await addItem(tx, orderId, s.versionId);
      await history(tx, orderId, null, 'PENDING_ASSIGNMENT', s.userId, 'CUSTOMER');
      // El cliente no envía ofertas; el operador sí. El sistema no puede llevarlo a ACCEPTED.
      await expectDbError(tx, () => history(tx, orderId, 'PENDING_ASSIGNMENT', 'OFFERED', s.userId, 'CUSTOMER'), /rol activo no puede/);
      await expectDbError(tx, () => history(tx, orderId, 'PENDING_ASSIGNMENT', 'DELIVERED', s.userId, 'ADMIN'), /rol activo no puede|order_status_history_from_status_id_to_status_id_fkey/);
      await history(tx, orderId, 'PENDING_ASSIGNMENT', 'OFFERED', s.userId, 'OPERATOR');
      await history(tx, orderId, 'OFFERED', 'PENDING_ASSIGNMENT', null, null, 'TIMER');
      await expectDbError(tx, () => history(tx, orderId, 'PENDING_ASSIGNMENT', 'OFFERED', null, null, 'TIMER'), /sistema no puede/);
      await expectDbError(tx, () => history(tx, orderId, 'PENDING_ASSIGNMENT', 'CANCELLED', null, 'CUSTOMER'), /automático/);
      await expectDbError(tx, () => tx.$executeRaw`UPDATE orders SET status_id = ${id('order_statuses', 'DELIVERED')} WHERE id = ${orderId}::uuid`, /se cambia insertando/);
      await expectDbError(tx, () => tx.$executeRaw`UPDATE orders SET customer_notes = 'otra' WHERE id = ${orderId}::uuid`, /no se editan/);
      await expectDbError(tx, () => tx.$executeRaw`UPDATE order_items SET quantity = 5 WHERE order_id = ${orderId}::uuid`, /no se editan/);
      await expectDbError(tx, () => tx.$executeRaw`DELETE FROM order_status_history WHERE order_id = ${orderId}::uuid`, /no se editan ni se borran/);
    });
  });

  it('la dirección es inmutable, una sola predeterminada, y la anonimización borra lo personal', async () => {
    await inTransaction(async (tx) => {
      const s = await scenario(tx);
      await expectDbError(tx, () => tx.$executeRaw`UPDATE addresses SET reference = 'Otra' WHERE id = ${s.addressId}::uuid`, /archivarla y crear otra/);
      await tx.$executeRaw`UPDATE addresses SET is_default = true WHERE id = ${s.addressId}::uuid`;
      await expectDbError(
        tx,
        () => tx.$executeRaw`INSERT INTO addresses (owner_user_id, label, reference, location, is_default)
          VALUES (${s.userId}::uuid, 'Trabajo', 'Oficina', ST_SetSRID(ST_MakePoint(-76.61, 1.03), 4326)::geography, true)`,
        /addresses_one_default_idx|23505/,
      );
      await tx.$executeRaw`INSERT INTO customer_recipients (owner_user_id, full_name, phone_e164) VALUES (${s.userId}::uuid, 'Doña Rosa', '+573105551234')`;
      const [person] = await tx.$queryRaw<{ person_id: string }[]>`SELECT person_id FROM users WHERE id = ${s.userId}::uuid`;
      await tx.$executeRaw`SELECT anonymize_person(${person.person_id}::uuid, ${s.userId}::uuid)`;
      const [address] = await tx.$queryRaw<{ reference: string | null; archived: boolean }[]>`
        SELECT reference, archived_at IS NOT NULL AS archived FROM addresses WHERE id = ${s.addressId}::uuid`;
      expect(address).toEqual({ reference: null, archived: true });
      const [recipient] = await tx.$queryRaw<{ phone_e164: string | null }[]>`SELECT phone_e164 FROM customer_recipients WHERE owner_user_id = ${s.userId}::uuid`;
      expect(recipient.phone_e164).toBeNull();
    });
  });

  it('cada medio contra entrega tiene su fila en "¿Cómo pagas al recibir?" y solo esos medios', async () => {
    await inTransaction(async (tx) => {
      const [{ missing }] = await tx.$queryRaw<{ missing: number }[]>`
        SELECT count(*)::int AS missing FROM payment_methods pm
        WHERE pm.is_cash_on_delivery AND NOT EXISTS (SELECT 1 FROM checkout_payment_methods c WHERE c.payment_method_id = pm.id)`;
      expect(missing).toBe(0);

      const [online] = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO payment_methods (code, sort_order, is_cash_on_delivery, is_account_based, requires_bank) VALUES ('PRUEBA_LINEA', 99, false, true, false) RETURNING id`;
      await expectDbError(tx, () => tx.$executeRaw`INSERT INTO checkout_payment_methods (payment_method_id, sort_order) VALUES (${online.id}::smallint, 9)`, /contra entrega/);
      await expectDbError(tx, () => tx.$executeRaw`UPDATE checkout_payment_methods SET sort_order = 0`, /sort_order_check/);
      // La imagen tiene que ser un archivo subido.
      await expectDbError(tx, () => tx.$executeRaw`UPDATE checkout_payment_methods SET image_file_id = gen_random_uuid()`, /image_file_id_fkey/);
    });
  });
});
