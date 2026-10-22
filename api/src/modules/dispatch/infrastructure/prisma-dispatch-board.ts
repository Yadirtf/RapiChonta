import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { DISPATCH_SOURCES, OFFER_TIMEOUT_SETTING, OfferModeCode, RECIPIENT_STATUSES, RecipientStatusCode, RETURN_SOURCES } from '../domain/dispatch.codes';
import { DISPATCH_ORDER_STATUSES } from '../domain/order-statuses';
import {
  AvailableCourier,
  BoardOrder,
  DispatchBoard,
  DispatchTarget,
  LiveOffer,
  NewOffer,
  OrderNoLongerDispatchable,
  RecipientRejected,
} from '../domain/ports/dispatch-board';
import { dbError, name, point } from './sql';

interface OrderRow {
  id: string;
  code: string;
  created_at: Date;
  status: string;
  needs_courier: boolean;
  is_initial: boolean;
  waiting_since: Date | null;
  last_source: string | null;
  status_since: Date;
  establishment_id: string;
  establishment_name: string;
  address_line: string;
  est_lat: number;
  est_lng: number;
  lat: number;
  lng: number;
  reference: string | null;
  zone_name: string;
  zone_kind: string;
  item_count: number;
  items_total: string;
  delivery_fee: string;
  total: string;
  payment_method: string;
  courier_user_id: string | null;
  courier_given: string | null;
  courier_family: string | null;
  assigned_at: Date | null;
  purchase_amount: string | null;
  receipt_file_id: string | null;
  estimated_ready_at: Date | null;
  is_delayed: boolean | null;
}

interface OfferRow {
  offer_id: string;
  order_id: string;
  mode: OfferModeCode;
  created_at: Date;
  expires_at: Date;
  sender_given: string | null;
  sender_family: string | null;
  courier_user_id: string;
  given_names: string;
  family_names: string | null;
  status: RecipientStatusCode;
  responded_at: Date | null;
}

const RETURNED = new Set<string>(Object.values(RETURN_SOURCES));

@Injectable()
export class PrismaDispatchBoard extends DispatchBoard {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async activeOrders(municipalityId: number): Promise<BoardOrder[]> {
    // "Busca domiciliario" = ni terminado ni con domiciliario (flags del catálogo, no códigos).
    const rows = await this.prisma.$queryRaw<OrderRow[]>`
      SELECT o.id, o.code, o.created_at, s.code AS status, NOT s.requires_courier AS needs_courier, s.is_initial,
             w.occurred_at AS waiting_since, last.source AS last_source, last.occurred_at AS status_since,
             e.id AS establishment_id, e.name AS establishment_name, e.address_line,
             ST_Y(e.location::geometry) AS est_lat, ST_X(e.location::geometry) AS est_lng,
             ST_Y(ad.location::geometry) AS lat, ST_X(ad.location::geometry) AS lng, ad.reference,
             z.name AS zone_name, zk.code AS zone_kind,
             (SELECT coalesce(sum(l.quantity), 0)::int FROM v_order_lines l WHERE l.order_id = o.id AND NOT l.is_removed) AS item_count,
             a.items_total::text AS items_total, a.delivery_fee::text AS delivery_fee, a.customer_total::text AS total,
             pm.code AS payment_method,
             oc.courier_user_id, cp.given_names AS courier_given, cp.family_names AS courier_family, oc.assigned_at,
             mv.amount::text AS purchase_amount, op.receipt_file_id, pr.estimated_ready_at, pr.is_delayed
      FROM orders o
      JOIN order_statuses s ON s.id = o.status_id AND NOT s.is_terminal
      JOIN establishments e ON e.id = o.establishment_id AND e.municipality_id = ${municipalityId}
      JOIN addresses ad ON ad.id = o.delivery_address_id
      JOIN delivery_zone_fees f ON f.id = o.delivery_zone_fee_id
      JOIN delivery_zones z ON z.id = f.delivery_zone_id
      JOIN zone_kinds zk ON zk.id = z.zone_kind_id
      JOIN v_order_amounts a ON a.order_id = o.id
      JOIN payment_methods pm ON pm.id = o.payment_method_id
      -- Inicio de la espera actual: la última entrada al estado inicial que no venga de una oferta (creado o liberado).
      LEFT JOIN LATERAL (
        SELECT h.occurred_at FROM order_status_history h
        JOIN order_statuses ts ON ts.id = h.to_status_id AND ts.is_initial
        LEFT JOIN order_statuses fs ON fs.id = h.from_status_id
        WHERE h.order_id = o.id AND (fs.id IS NULL OR fs.requires_courier)
        ORDER BY h.recorded_at DESC LIMIT 1) w ON true
      LEFT JOIN LATERAL (
        SELECT src.code AS source, h.occurred_at FROM order_status_history h JOIN status_change_sources src ON src.id = h.source_id
        WHERE h.order_id = o.id ORDER BY h.recorded_at DESC LIMIT 1) last ON true
      LEFT JOIN order_assignments oc ON oc.order_id = o.id AND oc.released_at IS NULL
      LEFT JOIN users cu ON cu.id = oc.courier_user_id
      LEFT JOIN people cp ON cp.id = cu.person_id
      LEFT JOIN order_purchases op ON op.order_id = o.id
      LEFT JOIN cash_movements mv ON mv.id = op.cash_movement_id
      LEFT JOIN v_order_preparation pr ON pr.order_id = o.id
      ORDER BY s.requires_courier, w.occurred_at NULLS LAST, o.created_at`;
    if (!rows.length) return [];

    const offers = await this.liveOffers(rows.filter((r) => r.needs_courier).map((r) => r.id));
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      createdAt: r.created_at,
      status: r.status,
      statusSince: r.status_since,
      needsCourier: r.needs_courier,
      waitingSince: r.needs_courier ? (r.waiting_since ?? r.created_at) : null,
      returnedBy: r.is_initial && r.last_source && RETURNED.has(r.last_source) ? r.last_source : null,
      establishment: { id: r.establishment_id, name: r.establishment_name, addressLine: r.address_line, location: point(r.est_lat, r.est_lng) },
      delivery: { location: point(r.lat, r.lng), reference: r.reference, zoneName: r.zone_name, zoneKind: r.zone_kind },
      itemCount: r.item_count,
      amounts: { items: r.items_total, deliveryFee: r.delivery_fee, total: r.total },
      paymentMethod: r.payment_method,
      liveOffers: offers.get(r.id) ?? [],
      courier: r.courier_user_id ? { userId: r.courier_user_id, name: name(r.courier_given!, r.courier_family), assignedAt: r.assigned_at! } : null,
      purchase: r.purchase_amount && r.receipt_file_id ? { amount: r.purchase_amount, receiptFileId: r.receipt_file_id } : null,
      preparation: r.estimated_ready_at ? { estimatedReadyAt: r.estimated_ready_at, delayed: r.is_delayed === true } : null,
    }));
  }

  /** Ofertas vivas (no vencidas, con alguien pendiente) con todos sus destinatarios y respuestas. */
  private async liveOffers(orderIds: string[]): Promise<Map<string, LiveOffer[]>> {
    const byOrder = new Map<string, LiveOffer[]>();
    if (!orderIds.length) return byOrder;
    const rows = await this.prisma.$queryRaw<OfferRow[]>`
      SELECT lo.order_offer_id AS offer_id, lo.order_id, m.code AS mode, lo.created_at, lo.expires_at,
             sp.given_names AS sender_given, sp.family_names AS sender_family,
             r.courier_user_id, p.given_names, p.family_names, rs.code AS status, r.responded_at
      FROM v_live_offers lo
      JOIN offer_modes m ON m.id = lo.offer_mode_id
      LEFT JOIN users su ON su.id = lo.sent_by_user_id
      LEFT JOIN people sp ON sp.id = su.person_id
      JOIN order_offer_recipients r ON r.order_offer_id = lo.order_offer_id
      JOIN offer_recipient_statuses rs ON rs.id = r.status_id
      JOIN users u ON u.id = r.courier_user_id
      JOIN people p ON p.id = u.person_id
      WHERE lo.order_id = ANY(${orderIds}::uuid[])
      ORDER BY lo.created_at DESC, rs.sort_order, p.given_names`;
    const offers = new Map<string, LiveOffer>();
    for (const row of rows) {
      let offer = offers.get(row.offer_id);
      if (!offer) {
        offer = {
          id: row.offer_id,
          mode: row.mode,
          sentAt: row.created_at,
          expiresAt: row.expires_at,
          sentBy: row.sender_given ? name(row.sender_given, row.sender_family) : null,
          recipients: [],
        };
        offers.set(row.offer_id, offer);
        byOrder.set(row.order_id, [...(byOrder.get(row.order_id) ?? []), offer]);
      }
      offer.recipients.push({ courierUserId: row.courier_user_id, name: name(row.given_names, row.family_names), status: row.status, respondedAt: row.responded_at });
    }
    return byOrder;
  }

  async findOrder(code: string): Promise<DispatchTarget | null> {
    const [row] = await this.prisma.$queryRaw<{ id: string; municipality_id: number; establishment_id: string; needs_courier: boolean }[]>`
      SELECT o.id, e.municipality_id, e.id AS establishment_id, (NOT s.is_terminal AND NOT s.requires_courier) AS needs_courier
      FROM orders o JOIN order_statuses s ON s.id = o.status_id JOIN establishments e ON e.id = o.establishment_id
      WHERE o.code = ${code}`;
    return row ? { id: row.id, municipalityId: row.municipality_id, establishmentId: row.establishment_id, needsCourier: row.needs_courier } : null;
  }

  async couriers(municipalityId: number, freshSeconds: number, orderId?: string): Promise<AvailableCourier[]> {
    const order = orderId ?? null;
    const rows = await this.prisma.$queryRaw<
      {
        user_id: string;
        given_names: string;
        family_names: string | null;
        phone_e164: string | null;
        vehicle_type: string | null;
        plate: string | null;
        lat: number | null;
        lng: number | null;
        accuracy_m: number | null;
        recorded_at: Date | null;
        fresh: boolean;
        available_since: Date;
        distance: number | null;
        pending: boolean;
        declined: boolean;
      }[]
    >`
      SELECT c.user_id, p.given_names, p.family_names, pp.phone_e164, vt.code AS vehicle_type, v.plate,
             ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lng, l.accuracy_m::float8 AS accuracy_m, l.recorded_at,
             coalesce(l.recorded_at > now() - make_interval(secs => ${freshSeconds}), false) AS fresh,
             av.started_at AS available_since,
             ST_Distance(l.location, e.location)::float8 AS distance,
             EXISTS (SELECT 1 FROM v_live_offers lo JOIN order_offer_recipients r ON r.order_offer_id = lo.order_offer_id
                     JOIN offer_recipient_statuses rs ON rs.id = r.status_id AND rs.is_initial
                     WHERE lo.order_id = ${order}::uuid AND r.courier_user_id = c.user_id) AS pending,
             EXISTS (SELECT 1 FROM order_offers oo JOIN order_offer_recipients r ON r.order_offer_id = oo.id
                     JOIN offer_recipient_statuses rs ON rs.id = r.status_id AND rs.code = ${RECIPIENT_STATUSES.REJECTED}
                     WHERE oo.order_id = ${order}::uuid AND r.courier_user_id = c.user_id) AS declined
      FROM v_dispatchable_couriers c
      JOIN v_open_availability av ON av.courier_user_id = c.user_id
      LEFT JOIN LATERAL (SELECT location, accuracy_m, recorded_at FROM courier_location_pings lp
                         WHERE lp.courier_user_id = c.user_id
                         ORDER BY lp.recorded_at DESC LIMIT 1) l ON true
      JOIN users u ON u.id = c.user_id
      JOIN people p ON p.id = u.person_id
      LEFT JOIN person_phones pp ON pp.person_id = p.id AND pp.is_primary
      LEFT JOIN LATERAL (SELECT vehicle_type_id, plate FROM vehicles WHERE courier_user_id = c.user_id AND retired_at IS NULL
                         ORDER BY created_at DESC LIMIT 1) v ON true
      LEFT JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
      LEFT JOIN orders o ON o.id = ${order}::uuid
      LEFT JOIN establishments e ON e.id = o.establishment_id
      WHERE c.municipality_id = ${municipalityId}
        AND NOT EXISTS (SELECT 1 FROM order_assignments x WHERE x.courier_user_id = c.user_id AND x.released_at IS NULL)
      ORDER BY fresh DESC, distance NULLS LAST, l.recorded_at DESC NULLS LAST, av.started_at`;
    return rows.map((r) => ({
      userId: r.user_id,
      name: name(r.given_names, r.family_names),
      phoneE164: r.phone_e164,
      vehicle: r.vehicle_type ? { type: r.vehicle_type, plate: r.plate } : null,
      location: r.lat === null || r.lng === null ? null : point(r.lat, r.lng),
      accuracyM: r.accuracy_m,
      lastSeenAt: r.recorded_at,
      locationFresh: r.fresh,
      availableSince: r.available_since,
      // Una distancia desde una ubicación vieja engaña: solo se da con lectura reciente.
      distanceMeters: r.distance === null || !r.fresh ? null : Math.round(r.distance),
      hasPendingOffer: r.pending,
      declined: r.declined,
    }));
  }

  async createOffer(offer: NewOffer): Promise<{ offerId: string; expiresAt: Date }> {
    const [modeId, pendingId, roleId, sourceId, offeredId] = await Promise.all([
      this.ids.of('offer_modes', offer.mode),
      this.ids.of('offer_recipient_statuses', RECIPIENT_STATUSES.PENDING),
      this.ids.of('roles', offer.actingRole),
      this.ids.of('status_change_sources', DISPATCH_SOURCES.USER_ACTION),
      this.ids.of('order_statuses', DISPATCH_ORDER_STATUSES.OFFERED),
    ]);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // La fila del pedido bloqueada: un envío a la vez por pedido, y nadie lo acepta a mitad del envío.
        const [order] = await tx.$queryRaw<{ status_id: number; is_initial: boolean; needs_courier: boolean; municipality_id: number }[]>`
          SELECT o.status_id, s.is_initial, (NOT s.is_terminal AND NOT s.requires_courier) AS needs_courier, e.municipality_id
          FROM orders o JOIN order_statuses s ON s.id = o.status_id JOIN establishments e ON e.id = o.establishment_id
          WHERE o.id = ${offer.orderId}::uuid FOR UPDATE OF o`;
        if (!order?.needs_courier) throw new OrderNoLongerDispatchable();
        // Desde el estado inicial pasa a OFFERED; si ya estaba ofrecido (escalar de uno a todos) solo se suma la oferta.
        if (order.is_initial) {
          await tx.$executeRaw`
            INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id)
            VALUES (${offer.orderId}::uuid, ${order.status_id}, ${offeredId}, ${offer.sentByUserId}::uuid, ${roleId}, ${sourceId})`;
        }
        const [created] = await tx.$queryRaw<{ id: string; expires_at: Date }[]>`
          INSERT INTO order_offers (order_id, offer_mode_id, sent_by_user_id, expires_at)
          SELECT ${offer.orderId}::uuid, ${modeId}, ${offer.sentByUserId}::uuid, clock_timestamp() + make_interval(secs => s.value::int)
          FROM v_current_settings s WHERE s.key = ${OFFER_TIMEOUT_SETTING} AND s.municipality_id = ${order.municipality_id}
          RETURNING id, expires_at`;
        if (!created) throw new Error(`Falta el parámetro ${OFFER_TIMEOUT_SETTING} (ejecute la semilla)`);
        await tx.$executeRaw`
          INSERT INTO order_offer_recipients (order_offer_id, courier_user_id, status_id)
          SELECT ${created.id}::uuid, courier, ${pendingId} FROM unnest(${offer.courierUserIds}::uuid[]) AS courier`;
        return { offerId: created.id, expiresAt: created.expires_at };
      });
    } catch (error) {
      if (dbError(error, '23514', 'domiciliarios verificados') || dbError(error, '23514', 'ya tiene domiciliario')) throw new RecipientRejected();
      throw error;
    }
  }
}
