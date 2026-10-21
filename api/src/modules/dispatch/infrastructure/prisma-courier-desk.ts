import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { ROLES } from '../../identity/domain/identity.codes';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { DISPATCH_SOURCES, LOCATION_CONSENT, RECIPIENT_STATUSES, RETURN_SOURCES } from '../domain/dispatch.codes';
import { ResponseFailure } from '../domain/offer-plan';
import { DISPATCH_ORDER_STATUSES } from '../domain/order-statuses';
import { CourierDesk, CourierOffer, CourierStatus, LocationReading, ResponseResult } from '../domain/ports/courier-desk';
import { dbError, point } from './sql';

type Tx = Prisma.TransactionClient;

/** Se aborta la transacción con el motivo que verá el domiciliario. */
class Refused extends Error {
  constructor(readonly reason: ResponseFailure) {
    super(reason);
  }
}

interface Claim {
  orderId: string;
  orderCode: string;
  statusId: number;
}

@Injectable()
export class PrismaCourierDesk extends CourierDesk {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async status(courierUserId: string): Promise<CourierStatus | null> {
    const [row] = await this.prisma.$queryRaw<{ verified: boolean; consent_pending: boolean; available_since: Date | null; order_code: string | null }[]>`
      SELECT vs.can_receive_offers AS verified,
             EXISTS (SELECT 1 FROM v_pending_consents pc WHERE pc.user_id = cp.user_id AND pc.document_type_code = ${LOCATION_CONSENT}) AS consent_pending,
             av.started_at AS available_since, o.code AS order_code
      FROM courier_profiles cp
      JOIN courier_verification_statuses vs ON vs.id = cp.verification_status_id
      LEFT JOIN v_open_availability av ON av.courier_user_id = cp.user_id
      LEFT JOIN order_assignments a ON a.courier_user_id = cp.user_id AND a.released_at IS NULL
      LEFT JOIN orders o ON o.id = a.order_id
      WHERE cp.user_id = ${courierUserId}::uuid`;
    return row ? { verified: row.verified, locationConsentPending: row.consent_pending, availableSince: row.available_since, activeOrderCode: row.order_code } : null;
  }

  async openAvailability(courierUserId: string): Promise<void> {
    // El índice único parcial deja un solo turno abierto: activarse dos veces no abre otro.
    await this.prisma.$executeRaw`
      INSERT INTO courier_availability_periods (courier_user_id) VALUES (${courierUserId}::uuid)
      ON CONFLICT (courier_user_id) WHERE ended_at IS NULL DO NOTHING`;
  }

  async closeAvailability(courierUserId: string, reason: string): Promise<void> {
    const reasonId = await this.ids.of('availability_end_reasons', reason);
    await this.prisma.$executeRaw`
      UPDATE courier_availability_periods SET ended_at = greatest(clock_timestamp(), started_at + interval '1 millisecond'), end_reason_id = ${reasonId}
      WHERE courier_user_id = ${courierUserId}::uuid AND ended_at IS NULL`;
  }

  async expectsLocation(courierUserId: string): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ expected: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM v_open_availability WHERE courier_user_id = ${courierUserId}::uuid)
          OR EXISTS (SELECT 1 FROM order_assignments WHERE courier_user_id = ${courierUserId}::uuid AND released_at IS NULL) AS expected`;
    return row.expected;
  }

  async recordLocations(courierUserId: string, readings: LocationReading[]): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO courier_location_pings (courier_user_id, location, accuracy_m, recorded_at)
      SELECT ${courierUserId}::uuid, ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography, r.accuracy, r.recorded_at
      FROM unnest(${readings.map((r) => r.location.latitude)}::float8[], ${readings.map((r) => r.location.longitude)}::float8[],
                  ${readings.map((r) => r.accuracyM)}::numeric[], ${readings.map((r) => r.recordedAt)}::timestamptz[])
           AS r(lat, lng, accuracy, recorded_at)`;
  }

  async pendingOffers(courierUserId: string): Promise<CourierOffer[]> {
    const rows = await this.prisma.$queryRaw<
      {
        offer_id: string;
        code: string;
        expires_at: Date;
        name: string;
        address_line: string;
        est_lat: number;
        est_lng: number;
        zone_name: string;
        zone_kind: string;
        item_count: number;
        items_total: string;
        delivery_fee: string;
        payment_method: string;
        distance: number | null;
      }[]
    >`
      SELECT oo.id AS offer_id, o.code, oo.expires_at, e.name, e.address_line,
             ST_Y(e.location::geometry) AS est_lat, ST_X(e.location::geometry) AS est_lng, z.name AS zone_name, zk.code AS zone_kind,
             (SELECT coalesce(sum(l.quantity), 0)::int FROM v_order_lines l WHERE l.order_id = o.id AND NOT l.is_removed) AS item_count,
             a.items_total::text AS items_total, a.delivery_fee::text AS delivery_fee, pm.code AS payment_method,
             ST_Distance(ll.location, e.location)::float8 AS distance
      FROM order_offer_recipients r
      JOIN offer_recipient_statuses rs ON rs.id = r.status_id AND rs.is_initial
      JOIN order_offers oo ON oo.id = r.order_offer_id AND oo.expires_at > now()
      JOIN orders o ON o.id = oo.order_id
      JOIN establishments e ON e.id = o.establishment_id
      JOIN delivery_zone_fees f ON f.id = o.delivery_zone_fee_id
      JOIN delivery_zones z ON z.id = f.delivery_zone_id
      JOIN zone_kinds zk ON zk.id = z.zone_kind_id
      JOIN v_order_amounts a ON a.order_id = o.id
      JOIN payment_methods pm ON pm.id = o.payment_method_id
      LEFT JOIN v_courier_last_location ll ON ll.courier_user_id = r.courier_user_id
      WHERE r.courier_user_id = ${courierUserId}::uuid
      ORDER BY oo.expires_at`;
    return rows.map((r) => ({
      offerId: r.offer_id,
      orderCode: r.code,
      expiresAt: r.expires_at,
      establishment: { name: r.name, addressLine: r.address_line, location: point(r.est_lat, r.est_lng) },
      zone: { name: r.zone_name, kind: r.zone_kind },
      itemCount: r.item_count,
      itemsTotal: r.items_total,
      deliveryFee: r.delivery_fee,
      paymentMethod: r.payment_method,
      distanceMeters: r.distance === null ? null : Math.round(r.distance),
    }));
  }

  /**
   * Docs/14 E07 "Aceptar una oferta", en una transacción: (1) se bloquea el pedido, así dos aceptaciones a la
   * vez se hacen en fila; (2) actualización condicional de la respuesta (solo si sigue pendiente y no venció);
   * (3) la asignación (índices únicos: una vigente por pedido y por domiciliario); (4) OFFERED → ACCEPTED;
   * (5) se retira la oferta a los demás y las otras ofertas pendientes de este domiciliario.
   */
  async accept(offerId: string, courierUserId: string): Promise<ResponseResult> {
    const [accepted, withdrawn, courierRole, source, offered, acceptedStatus] = await Promise.all([
      this.ids.of('offer_recipient_statuses', RECIPIENT_STATUSES.ACCEPTED),
      this.ids.of('offer_recipient_statuses', RECIPIENT_STATUSES.WITHDRAWN),
      this.ids.of('roles', ROLES.COURIER),
      this.ids.of('status_change_sources', DISPATCH_SOURCES.USER_ACTION),
      this.ids.of('order_statuses', DISPATCH_ORDER_STATUSES.OFFERED),
      this.ids.of('order_statuses', DISPATCH_ORDER_STATUSES.ACCEPTED),
    ]);
    return this.respond(offerId, courierUserId, async (tx, claim) => {
      if (claim.statusId !== offered) throw new Refused(await this.closedReason(tx, offerId, courierUserId));
      if (await this.hasActiveAssignment(tx, courierUserId)) throw new Refused('BUSY');
      await this.answer(tx, offerId, courierUserId, accepted);
      await tx.$executeRaw`
        INSERT INTO order_assignments (order_id, order_offer_id, courier_user_id)
        VALUES (${claim.orderId}::uuid, ${offerId}::uuid, ${courierUserId}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id)
        VALUES (${claim.orderId}::uuid, ${offered}, ${acceptedStatus}, ${courierUserId}::uuid, ${courierRole}, ${source})`;
      await tx.$executeRaw`
        UPDATE order_offer_recipients r SET status_id = ${withdrawn}, responded_at = clock_timestamp()
        FROM order_offers o, offer_recipient_statuses s
        WHERE o.id = r.order_offer_id AND s.id = r.status_id AND s.is_initial
          AND (o.order_id = ${claim.orderId}::uuid OR r.courier_user_id = ${courierUserId}::uuid)`;
      return false;
    });
  }

  async reject(offerId: string, courierUserId: string): Promise<ResponseResult> {
    const [rejected, source, offered] = await Promise.all([
      this.ids.of('offer_recipient_statuses', RECIPIENT_STATUSES.REJECTED),
      this.ids.of('status_change_sources', RETURN_SOURCES.OFFERS_DECLINED),
      this.ids.of('order_statuses', DISPATCH_ORDER_STATUSES.OFFERED),
    ]);
    return this.respond(offerId, courierUserId, async (tx, claim) => {
      await this.answer(tx, offerId, courierUserId, rejected);
      // Si nadie más puede responder, el pedido vuelve al panel ahora (no espera el vencimiento).
      const returned = await tx.$executeRaw`
        INSERT INTO order_status_history (order_id, from_status_id, to_status_id, source_id)
        SELECT ${claim.orderId}::uuid, ${offered}, initial.id, ${source}
        FROM order_statuses initial
        WHERE initial.is_initial AND initial.deactivated_at IS NULL AND ${claim.statusId} = ${offered}
          AND NOT EXISTS (SELECT 1 FROM v_live_offers WHERE order_id = ${claim.orderId}::uuid)
          AND NOT EXISTS (SELECT 1 FROM order_assignments WHERE order_id = ${claim.orderId}::uuid AND released_at IS NULL)`;
      return returned > 0;
    });
  }

  /** Bloquea el pedido de la oferta y corre `work`; traduce los rechazos y las violaciones de unicidad. */
  private async respond(offerId: string, courierUserId: string, work: (tx: Tx, claim: Claim) => Promise<boolean>): Promise<ResponseResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [claim] = await tx.$queryRaw<{ order_id: string; code: string; status_id: number }[]>`
          SELECT o.id AS order_id, o.code, o.status_id
          FROM order_offer_recipients r JOIN order_offers oo ON oo.id = r.order_offer_id JOIN orders o ON o.id = oo.order_id
          WHERE r.order_offer_id = ${offerId}::uuid AND r.courier_user_id = ${courierUserId}::uuid
          FOR UPDATE OF o`;
        if (!claim) throw new Refused('NOT_FOUND');
        const returnedToPanel = await work(tx, { orderId: claim.order_id, orderCode: claim.code, statusId: claim.status_id });
        return { ok: true as const, orderId: claim.order_id, orderCode: claim.code, returnedToPanel };
      });
    } catch (error) {
      if (error instanceof Refused) return { ok: false, reason: error.reason };
      if (dbError(error, '23505', 'one_active_per_order')) return { ok: false, reason: 'TAKEN' };
      if (dbError(error, '23505', 'one_active_per_courier')) return { ok: false, reason: 'BUSY' };
      throw error;
    }
  }

  /** La actualización condicional (H07.3): 0 filas = venció, ya respondió o se la retiraron. */
  private async answer(tx: Tx, offerId: string, courierUserId: string, statusId: number): Promise<void> {
    const updated = await tx.$executeRaw`
      UPDATE order_offer_recipients r SET status_id = ${statusId}, responded_at = clock_timestamp()
      FROM order_offers o, offer_recipient_statuses s
      WHERE o.id = r.order_offer_id AND s.id = r.status_id AND s.is_initial
        AND r.order_offer_id = ${offerId}::uuid AND r.courier_user_id = ${courierUserId}::uuid
        AND clock_timestamp() < o.expires_at`;
    if (updated !== 1) throw new Refused(await this.closedReason(tx, offerId, courierUserId));
  }

  /** Por qué ya no se puede responder: otro la tomó, venció o se cerró (respondida, cancelada). */
  private async closedReason(tx: Tx, offerId: string, courierUserId: string): Promise<ResponseFailure> {
    const [state] = await tx.$queryRaw<{ status: string; expired: boolean; taken: boolean }[]>`
      SELECT s.code AS status, o.expires_at <= clock_timestamp() AS expired,
             EXISTS (SELECT 1 FROM order_assignments a WHERE a.order_id = o.order_id AND a.released_at IS NULL) AS taken
      FROM order_offer_recipients r JOIN order_offers o ON o.id = r.order_offer_id JOIN offer_recipient_statuses s ON s.id = r.status_id
      WHERE r.order_offer_id = ${offerId}::uuid AND r.courier_user_id = ${courierUserId}::uuid`;
    if (state.taken && state.status !== RECIPIENT_STATUSES.ACCEPTED) return 'TAKEN';
    if (state.status === RECIPIENT_STATUSES.EXPIRED || (state.status === RECIPIENT_STATUSES.PENDING && state.expired)) return 'EXPIRED';
    return 'CLOSED';
  }

  private async hasActiveAssignment(tx: Tx, courierUserId: string): Promise<boolean> {
    const [row] = await tx.$queryRaw<{ active: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM order_assignments WHERE courier_user_id = ${courierUserId}::uuid AND released_at IS NULL) AS active`;
    return row.active;
  }
}
