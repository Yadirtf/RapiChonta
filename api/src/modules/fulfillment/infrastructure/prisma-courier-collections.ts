import { Injectable } from '@nestjs/common';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { CollectionMethod, ResolvedPayment } from '../domain/collection';
import { COLLECTION_MOVEMENT, COLLECTION_QR_PURPOSE, TRIP_STATUSES } from '../domain/fulfillment.codes';
import { CollectionAccount, CollectionResult, CourierCollections, PendingCollection } from '../domain/ports/courier-trips';

/**
 * Se cobra donde el cliente o después de entregar: desde que sale del local (ON_THE_WAY) hasta que el pedido se cierra.
 * PENDING_REVIEW y DISPUTED cuentan: dejó el pedido con foto y alguien de la casa pagó.
 */
const COLLECTABLE = [TRIP_STATUSES.ON_THE_WAY, TRIP_STATUSES.ARRIVING, TRIP_STATUSES.PENDING_REVIEW, TRIP_STATUSES.DISPUTED];

class Refused extends Error {
  constructor(
    readonly reason: 'NOT_FOUND' | 'STEP',
    readonly status?: string,
  ) {
    super(reason);
  }
}

@Injectable()
export class PrismaCourierCollections extends CourierCollections {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  methods(courierUserId: string): Promise<CollectionMethod[]> {
    return this.prisma.$queryRaw<CollectionMethod[]>`
      SELECT pm.code, pm.is_account_based AS "isAccountBased", a.id AS "accountId"
      FROM payment_methods pm
      LEFT JOIN courier_collection_accounts a
        ON a.payment_method_id = pm.id AND a.courier_user_id = ${courierUserId}::uuid AND a.archived_at IS NULL
      WHERE pm.deactivated_at IS NULL AND pm.is_cash_on_delivery
      ORDER BY pm.sort_order`;
  }

  accounts(courierUserId: string): Promise<CollectionAccount[]> {
    return this.prisma.$queryRaw<CollectionAccount[]>`
      SELECT a.id, pm.code AS "paymentMethod", b.name AS bank, t.code AS "accountType", a.account_number AS "accountNumber",
             a.holder_name AS "holderName", a.qr_file_id AS "qrFileId"
      FROM courier_collection_accounts a
      JOIN payment_methods pm ON pm.id = a.payment_method_id
      LEFT JOIN banks b ON b.id = a.bank_id
      LEFT JOIN bank_account_types t ON t.id = a.bank_account_type_id
      WHERE a.courier_user_id = ${courierUserId}::uuid AND a.archived_at IS NULL
      ORDER BY pm.sort_order`;
  }

  async setQr(courierUserId: string, accountId: string, fileId: string): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE courier_collection_accounts a SET qr_file_id = f.id
      FROM files f JOIN file_purposes p ON p.id = f.purpose_id AND p.code = ${COLLECTION_QR_PURPOSE}
      WHERE a.id = ${accountId}::uuid AND a.courier_user_id = ${courierUserId}::uuid AND a.archived_at IS NULL
        AND f.id = ${fileId}::uuid AND f.uploaded_by_user_id = ${courierUserId}::uuid`;
    return updated === 1;
  }

  async record(courierUserId: string, orderCode: string, payments: readonly ResolvedPayment[], occurredAt: Date): Promise<CollectionResult> {
    const collection = await this.ids.of('cash_movement_types', COLLECTION_MOVEMENT);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // El pedido bloqueado: dos envíos del mismo cobro (doble toque, la cola sin señal) se hacen en fila.
        const [order] = await tx.$queryRaw<{ id: string; status: string; delivered: boolean; collected: boolean }[]>`
          SELECT o.id, s.code AS status, s.counts_as_delivered AS delivered,
                 EXISTS (SELECT 1 FROM v_order_collections c WHERE c.order_id = o.id) AS collected
          FROM orders o
          JOIN order_statuses s ON s.id = o.status_id
          JOIN v_order_courier oc ON oc.order_id = o.id AND oc.courier_user_id = ${courierUserId}::uuid
          WHERE o.code = ${orderCode}
          FOR UPDATE OF o`;
        if (!order) throw new Refused('NOT_FOUND');
        if (order.collected) return { ok: true as const, replayed: true };
        if (!order.delivered && !(COLLECTABLE as readonly string[]).includes(order.status)) throw new Refused('STEP', order.status);
        // La caja del día del municipio del local, la misma de la compra (se crea si el cobro llega primero, p. ej. sin compra).
        const [box] = await tx.$queryRaw<{ id: string }[]>`
          WITH day AS (
            SELECT (${occurredAt}::timestamptz AT TIME ZONE m.time_zone)::date AS business_date
            FROM orders o JOIN establishments e ON e.id = o.establishment_id JOIN municipalities m ON m.id = e.municipality_id
            WHERE o.id = ${order.id}::uuid),
          created AS (
            INSERT INTO cash_boxes (courier_user_id, business_date)
            SELECT ${courierUserId}::uuid, business_date FROM day
            ON CONFLICT (courier_user_id, business_date) DO NOTHING RETURNING id)
          SELECT id FROM created
          UNION ALL
          SELECT b.id FROM cash_boxes b JOIN day ON b.business_date = day.business_date WHERE b.courier_user_id = ${courierUserId}::uuid
          LIMIT 1`;
        // Quién cobró queda en created_by_user_id, como en la compra; la cuenta va solo en los medios de cuenta (disparador).
        await tx.$executeRaw`
          INSERT INTO cash_movements (cash_box_id, movement_type_id, amount, order_id, payment_method_id, collection_account_id, created_by_user_id)
          SELECT ${box.id}::uuid, ${collection}, x.amount, ${order.id}::uuid, pm.id, x.account, ${courierUserId}::uuid
          FROM unnest(${payments.map((p) => p.paymentMethod)}::text[], ${payments.map((p) => p.amount)}::numeric[],
                      ${payments.map((p) => p.collectionAccountId)}::uuid[]) AS x(method, amount, account)
          JOIN payment_methods pm ON pm.code = x.method`;
        return { ok: true as const, replayed: false };
      });
    } catch (error) {
      if (error instanceof Refused) return { ok: false, reason: error.reason, status: error.status };
      throw error;
    }
  }

  pending(courierUserId: string): Promise<PendingCollection[]> {
    return this.prisma.$queryRaw<PendingCollection[]>`
      SELECT o.code, s.code AS status, e.name AS "storeName", a.customer_total::text AS "customerTotal", pm.code AS "paymentMethod",
             h.occurred_at AS "closedAt"
      FROM v_order_courier oc
      JOIN orders o ON o.id = oc.order_id
      JOIN order_statuses s ON s.id = o.status_id
      JOIN establishments e ON e.id = o.establishment_id
      JOIN v_order_amounts a ON a.order_id = o.id
      JOIN payment_methods pm ON pm.id = o.payment_method_id
      CROSS JOIN LATERAL (SELECT occurred_at FROM order_status_history WHERE order_id = o.id ORDER BY recorded_at DESC LIMIT 1) h
      WHERE oc.courier_user_id = ${courierUserId}::uuid AND oc.released_at IS NOT NULL
        AND (s.counts_as_delivered OR s.code IN (${TRIP_STATUSES.PENDING_REVIEW}, ${TRIP_STATUSES.DISPUTED}))
        AND h.occurred_at > now() - interval '24 hours'
        AND NOT EXISTS (SELECT 1 FROM v_order_collections c WHERE c.order_id = o.id)
      ORDER BY h.occurred_at DESC`;
  }
}
