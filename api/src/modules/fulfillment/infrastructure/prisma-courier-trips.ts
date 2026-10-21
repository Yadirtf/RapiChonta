import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { ROLES } from '../../identity/domain/identity.codes';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { PURCHASE_MOVEMENT, RECEIPT_PURPOSE, TRIP_SOURCES, TRIP_STATUSES, TripStatusCode } from '../domain/fulfillment.codes';
import { CourierTrips, Trip, TripCommand, TripFailure, TripRef, TripResult } from '../domain/ports/courier-trips';

type Tx = Prisma.TransactionClient;

/** Se aborta la transacción con el motivo que verá el domiciliario. */
class Refused extends Error {
  constructor(
    readonly reason: TripFailure,
    readonly status: string,
  ) {
    super(reason);
  }
}

const point = (lat: number, lng: number) => GeoPoint.create(lat, lng);

/** Un error de la base dentro de $queryRaw llega con el SQLSTATE y el nombre de la restricción en el texto. */
const isClientEventReplay = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.message.includes('23505') && error.message.includes('client_event_id');

@Injectable()
export class PrismaCourierTrips extends CourierTrips {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async active(courierUserId: string, language: string): Promise<Trip | null> {
    const [row] = await this.prisma.$queryRaw<
      {
        order_id: string;
        code: string;
        status: string;
        reveals: boolean;
        last_change_at: Date;
        accepted_at: Date;
        store_name: string;
        store_address: string;
        store_phone: string | null;
        store_lat: number;
        store_lng: number;
        ring: [number, number][];
        zone_name: string;
        zone_kind: string;
        items_total: string;
        delivery_fee: string;
        customer_total: string;
        payment_method: string;
        customer_notes: string | null;
        address_label: string | null;
        address_line: string | null;
        address_reference: string | null;
        dest_lat: number;
        dest_lng: number;
        recipient_name: string;
        recipient_phone: string | null;
        started_at: Date | null;
        estimated_ready_at: Date | null;
        delay_count: number | null;
        next_check_at: Date | null;
        purchase_amount: string | null;
        receipt_file_id: string | null;
      }[]
    >`
      SELECT o.id AS order_id, o.code, s.code AS status, s.reveals_delivery_details AS reveals,
             (SELECT max(h.occurred_at) FROM order_status_history h WHERE h.order_id = o.id) AS last_change_at,
             a.assigned_at AS accepted_at,
             e.name AS store_name, e.address_line AS store_address,
             (SELECT ep.phone_e164 FROM establishment_phones ep WHERE ep.establishment_id = e.id ORDER BY ep.phone_e164 LIMIT 1) AS store_phone,
             ST_Y(e.location::geometry) AS store_lat, ST_X(e.location::geometry) AS store_lng,
             ST_AsGeoJSON(e.area::geometry)::json -> 'coordinates' -> 0 AS ring,
             z.name AS zone_name, zk.code AS zone_kind,
             am.items_total::text AS items_total, am.delivery_fee::text AS delivery_fee, am.customer_total::text AS customer_total,
             pm.code AS payment_method, o.customer_notes,
             ad.label AS address_label, ad.line AS address_line, ad.reference AS address_reference,
             ST_Y(ad.location::geometry) AS dest_lat, ST_X(ad.location::geometry) AS dest_lng,
             COALESCE(r.full_name, concat_ws(' ', cp.given_names, cp.family_names)) AS recipient_name,
             COALESCE(r.phone_e164, cph.phone_e164) AS recipient_phone,
             pr.started_at, pr.estimated_ready_at, pr.delay_count, pr.next_check_at,
             mv.amount::text AS purchase_amount, op.receipt_file_id
      FROM order_assignments a
      JOIN orders o ON o.id = a.order_id
      JOIN order_statuses s ON s.id = o.status_id
      JOIN establishments e ON e.id = o.establishment_id
      JOIN delivery_zone_fees f ON f.id = o.delivery_zone_fee_id
      JOIN delivery_zones z ON z.id = f.delivery_zone_id
      JOIN zone_kinds zk ON zk.id = z.zone_kind_id
      JOIN v_order_amounts am ON am.order_id = o.id
      JOIN payment_methods pm ON pm.id = o.payment_method_id
      JOIN addresses ad ON ad.id = o.delivery_address_id
      LEFT JOIN customer_recipients r ON r.id = o.recipient_id
      JOIN users cu ON cu.id = o.customer_user_id
      JOIN people cp ON cp.id = cu.person_id
      LEFT JOIN person_phones cph ON cph.person_id = cp.id AND cph.is_primary
      LEFT JOIN v_order_preparation pr ON pr.order_id = o.id
      LEFT JOIN order_purchases op ON op.order_id = o.id
      LEFT JOIN cash_movements mv ON mv.id = op.cash_movement_id
      WHERE a.courier_user_id = ${courierUserId}::uuid AND a.released_at IS NULL`;
    if (!row) return null;

    const lines = await this.prisma.$queryRaw<{ name: string; quantity: number; notes: string | null }[]>`
      SELECT COALESCE(tl.name, te.name) AS name, l.quantity::int AS quantity, l.notes
      FROM v_order_lines l
      JOIN languages les ON les.code = 'es'
      LEFT JOIN languages ll ON ll.code = ${language}
      JOIN product_version_texts te ON te.product_version_id = l.product_version_id AND te.language_id = les.id
      LEFT JOIN product_version_texts tl ON tl.product_version_id = l.product_version_id AND tl.language_id = ll.id
      WHERE l.order_id = ${row.order_id}::uuid AND NOT l.is_removed
      ORDER BY l.unit_price * l.quantity DESC, name`;

    return {
      orderId: row.order_id,
      code: row.code,
      status: row.status,
      lastChangeAt: row.last_change_at,
      acceptedAt: row.accepted_at,
      establishment: {
        name: row.store_name,
        addressLine: row.store_address,
        phone: row.store_phone,
        location: point(row.store_lat, row.store_lng),
        // GeoJSON es [lng, lat] y repite el primer vértice al final.
        area: row.ring.slice(0, -1).map(([lng, lat]) => point(lat, lng)),
      },
      zone: { name: row.zone_name, kind: row.zone_kind },
      lines,
      itemsTotal: row.items_total,
      deliveryFee: row.delivery_fee,
      customerTotal: row.customer_total,
      paymentMethod: row.payment_method,
      customerNotes: row.customer_notes,
      // RNF-06 al revés: el domiciliario solo ve a dónde va y a quién llamar cuando ya lleva el pedido.
      destination: row.reveals
        ? {
            label: row.address_label,
            line: row.address_line,
            reference: row.address_reference,
            location: point(row.dest_lat, row.dest_lng),
            recipientName: row.recipient_name,
            recipientPhone: row.recipient_phone,
          }
        : null,
      preparation:
        row.started_at && row.estimated_ready_at && row.next_check_at
          ? { startedAt: row.started_at, estimatedReadyAt: row.estimated_ready_at, delayCount: row.delay_count ?? 0, nextCheckAt: row.next_check_at }
          : null,
      purchase: row.purchase_amount && row.receipt_file_id ? { amount: row.purchase_amount, receiptFileId: row.receipt_file_id } : null,
    };
  }

  async ref(courierUserId: string, code: string): Promise<TripRef | null> {
    const [row] = await this.prisma.$queryRaw<{ order_id: string; code: string; status: string; last_change_at: Date }[]>`
      SELECT o.id AS order_id, o.code, s.code AS status,
             (SELECT max(h.occurred_at) FROM order_status_history h WHERE h.order_id = o.id) AS last_change_at
      FROM order_assignments a
      JOIN orders o ON o.id = a.order_id
      JOIN order_statuses s ON s.id = o.status_id
      WHERE a.courier_user_id = ${courierUserId}::uuid AND a.released_at IS NULL AND o.code = ${code}`;
    return row ? { orderId: row.order_id, code: row.code, status: row.status, lastChangeAt: row.last_change_at } : null;
  }

  async replayedOrderCode(clientEventId: string): Promise<string | null> {
    const [row] = await this.prisma.$queryRaw<{ code: string }[]>`
      SELECT o.code FROM order_status_history h JOIN orders o ON o.id = h.order_id WHERE h.client_event_id = ${clientEventId}::uuid
      UNION ALL
      SELECT o.code FROM order_preparation_delays d JOIN orders o ON o.id = d.order_id WHERE d.client_event_id = ${clientEventId}::uuid
      LIMIT 1`;
    return row?.code ?? null;
  }

  async registerPurchase(command: TripCommand & { amount: string; receiptFileId: string }): Promise<TripResult> {
    const purchase = await this.ids.of('cash_movement_types', PURCHASE_MOVEMENT);
    return this.step(command, TRIP_STATUSES.AT_ESTABLISHMENT, async (tx) => {
      const [receipt] = await tx.$queryRaw<{ usable: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM files f JOIN file_purposes p ON p.id = f.purpose_id AND p.code = ${RECEIPT_PURPOSE}
          WHERE f.id = ${command.receiptFileId}::uuid AND f.uploaded_by_user_id = ${command.courierUserId}::uuid
            AND NOT EXISTS (SELECT 1 FROM order_purchases op WHERE op.receipt_file_id = f.id)) AS usable`;
      if (!receipt.usable) throw new Refused('RECEIPT', TRIP_STATUSES.AT_ESTABLISHMENT);
      // La caja del día (en la hora del municipio del local). En modo CASH_BOX el administrador agrega la base
      // (OPENING) a esta misma caja; en OWN_FUNDS la caja nace con la primera compra (E11).
      const [box] = await tx.$queryRaw<{ id: string }[]>`
        WITH day AS (
          SELECT (${command.occurredAt}::timestamptz AT TIME ZONE m.time_zone)::date AS business_date
          FROM orders o JOIN establishments e ON e.id = o.establishment_id JOIN municipalities m ON m.id = e.municipality_id
          WHERE o.id = ${command.trip.orderId}::uuid),
        created AS (
          INSERT INTO cash_boxes (courier_user_id, business_date)
          SELECT ${command.courierUserId}::uuid, business_date FROM day
          ON CONFLICT (courier_user_id, business_date) DO NOTHING RETURNING id)
        SELECT id FROM created
        UNION ALL
        SELECT b.id FROM cash_boxes b JOIN day ON b.business_date = day.business_date WHERE b.courier_user_id = ${command.courierUserId}::uuid
        LIMIT 1`;
      const [movement] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO cash_movements (cash_box_id, movement_type_id, amount, order_id, created_by_user_id)
        VALUES (${box.id}::uuid, ${purchase}, ${command.amount}::numeric, ${command.trip.orderId}::uuid, ${command.courierUserId}::uuid)
        RETURNING id`;
      await tx.$executeRaw`
        INSERT INTO order_purchases (order_id, cash_movement_id, receipt_file_id)
        VALUES (${command.trip.orderId}::uuid, ${movement.id}::uuid, ${command.receiptFileId}::uuid)`;
      await this.history(tx, command, TRIP_STATUSES.AT_ESTABLISHMENT, TRIP_STATUSES.PREPARING);
    });
  }

  async markReady(command: TripCommand): Promise<TripResult> {
    return this.step(command, TRIP_STATUSES.PREPARING, (tx) => this.history(tx, command, TRIP_STATUSES.PREPARING, TRIP_STATUSES.ON_THE_WAY));
  }

  async reportDelay(command: TripCommand): Promise<TripResult> {
    return this.step(command, TRIP_STATUSES.PREPARING, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO order_preparation_delays (order_id, reported_by_user_id, reported_at, client_event_id)
        VALUES (${command.trip.orderId}::uuid, ${command.courierUserId}::uuid,
                greatest(${command.occurredAt}::timestamptz, (SELECT started_at FROM v_order_preparation WHERE order_id = ${command.trip.orderId}::uuid)),
                ${command.clientEventId}::uuid)`;
    });
  }

  /**
   * Bloquea el pedido, confirma que sigue en el paso esperado y que sigue siendo de este domiciliario, y corre
   * `work`. Un reenvío simultáneo del mismo evento choca con el UNIQUE de client_event_id: se responde como hecho.
   */
  private async step(command: TripCommand, expected: TripStatusCode, work: (tx: Tx) => Promise<void>): Promise<TripResult> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const [current] = await tx.$queryRaw<{ status: string; mine: boolean }[]>`
          SELECT s.code AS status,
                 EXISTS (SELECT 1 FROM order_assignments a WHERE a.order_id = o.id AND a.courier_user_id = ${command.courierUserId}::uuid
                         AND a.released_at IS NULL) AS mine
          FROM orders o JOIN order_statuses s ON s.id = o.status_id
          WHERE o.id = ${command.trip.orderId}::uuid
          FOR UPDATE OF o`;
        if (!current?.mine || current.status !== expected) throw new Refused('STEP', current?.status ?? 'UNKNOWN');
        await work(tx);
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof Refused) return { ok: false, reason: error.reason, status: error.status };
      if (isClientEventReplay(error)) return { ok: true };
      throw error;
    }
  }

  private async history(tx: Tx, command: TripCommand, from: TripStatusCode, to: TripStatusCode): Promise<void> {
    const [fromId, toId, role, source] = await Promise.all([
      this.ids.of('order_statuses', from),
      this.ids.of('order_statuses', to),
      this.ids.of('roles', ROLES.COURIER),
      this.ids.of('status_change_sources', command.offline ? TRIP_SOURCES.OFFLINE_SYNC : TRIP_SOURCES.USER_ACTION),
    ]);
    await tx.$executeRaw`
      INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id, client_event_id, occurred_at)
      VALUES (${command.trip.orderId}::uuid, ${fromId}, ${toId}, ${command.courierUserId}::uuid, ${role}, ${source},
              ${command.clientEventId}::uuid, ${command.occurredAt}::timestamptz)`;
  }
}
