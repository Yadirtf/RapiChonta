import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { BoxDetail, BoxMovement, BoxOrder, CashBoxReader, CourierBoxRow, CourierDay, PersonName, UncollectedOrder } from '../domain/ports/cash-boxes';
import { CashMethod, MovementTotal } from '../domain/settlement';

const person = (givenNames: string, familyNames: string | null): PersonName => ({ givenNames, familyNames });

/** Lecturas de las cajas. El saldo sale de v_cash_box_balances; el modo del día, de v_cash_box_funding. */
@Injectable()
export class PrismaCashBoxReader extends CashBoxReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async today(municipalityId: number): Promise<string> {
    const [row] = await this.prisma.$queryRaw<{ today: string }[]>`
      SELECT (now() AT TIME ZONE time_zone)::date::text AS today FROM municipalities WHERE id = ${municipalityId}`;
    return row.today;
  }

  /**
   * Los domiciliarios del municipio que pueden trabajar, más cualquiera que tenga caja esa fecha (aunque hoy ya no
   * esté despachable), cada uno con su caja de ese día si existe.
   */
  async board(municipalityId: number, businessDate: string): Promise<CourierBoxRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        courier_user_id: string;
        given_names: string;
        family_names: string | null;
        phone_e164: string | null;
        funding_mode: string | null;
        requires_opening: boolean;
        busy: boolean;
        can_receive_offers: boolean | null;
        box_id: string | null;
        is_closed: boolean | null;
        opening: string | null;
        collected: string | null;
        settled_orders: number | null;
        amount_due: string | null;
        closed_at: Date | null;
      }[]
    >`
      SELECT d.courier_user_id, p.given_names, p.family_names, pp.phone_e164,
             fm.code AS funding_mode, coalesce(fm.requires_box_opening, false) AS requires_opening,
             EXISTS (SELECT 1 FROM order_assignments a WHERE a.courier_user_id = d.courier_user_id AND a.released_at IS NULL) AS busy,
             CASE WHEN d.business_date = ${businessDate}::date THEN r.can_receive_offers END AS can_receive_offers,
             b.id AS box_id, cl.cash_box_id IS NOT NULL AS is_closed,
             mv.opening::text AS opening, coalesce(mv.collected, 0)::text AS collected,
             bal.settled_orders, bal.amount_due::text AS amount_due, cl.closed_at
      FROM v_courier_business_day d
      JOIN users u ON u.id = d.courier_user_id
      JOIN people p ON p.id = u.person_id
      LEFT JOIN person_phones pp ON pp.person_id = p.id AND pp.is_primary
      LEFT JOIN LATERAL (SELECT c.funding_mode_id FROM courier_funding_modes c
                         WHERE c.courier_user_id = d.courier_user_id AND c.effective_on <= ${businessDate}::date
                         ORDER BY c.effective_on DESC LIMIT 1) f ON true
      LEFT JOIN funding_modes fm ON fm.id = f.funding_mode_id
      LEFT JOIN v_courier_cash_readiness r ON r.courier_user_id = d.courier_user_id
      LEFT JOIN cash_boxes b ON b.courier_user_id = d.courier_user_id AND b.business_date = ${businessDate}::date
      LEFT JOIN cash_box_closures cl ON cl.cash_box_id = b.id
      LEFT JOIN v_cash_box_balances bal ON bal.cash_box_id = b.id
      LEFT JOIN LATERAL (SELECT sum(x.amount) FILTER (WHERE t.opens_box) AS opening, sum(x.amount) FILTER (WHERE t.settles_order) AS collected
                         FROM cash_movements x JOIN cash_movement_types t ON t.id = x.movement_type_id
                         WHERE x.cash_box_id = b.id) mv ON true
      WHERE d.municipality_id = ${municipalityId}
        AND (b.id IS NOT NULL OR EXISTS (SELECT 1 FROM v_dispatchable_couriers c WHERE c.user_id = d.courier_user_id))
      ORDER BY p.given_names, p.family_names`;
    return rows.map((r) => ({
      courierUserId: r.courier_user_id,
      name: person(r.given_names, r.family_names),
      phoneE164: r.phone_e164,
      fundingMode: r.funding_mode,
      requiresOpening: r.requires_opening,
      busy: r.busy,
      canReceiveOffers: r.can_receive_offers,
      box: r.box_id
        ? {
            id: r.box_id,
            state: r.is_closed ? 'CLOSED' : 'OPEN',
            opening: r.opening,
            collected: r.collected ?? '0.00',
            settledOrders: r.settled_orders ?? 0,
            amountDue: r.amount_due ?? '0.00',
            closedAt: r.closed_at,
          }
        : null,
    }));
  }

  async detail(boxId: string): Promise<BoxDetail | null> {
    const [head] = await this.prisma.$queryRaw<
      {
        id: string;
        courier_user_id: string;
        municipality_id: number | null;
        business_date: string;
        given_names: string;
        family_names: string | null;
        funding_mode: string | null;
        is_closed: boolean;
        courier_fees: string;
        commissions: string;
        settled_orders: number;
        amount_due: string;
        closed_at: Date | null;
        closer_given: string | null;
        closer_family: string | null;
        notes: string | null;
      }[]
    >`
      SELECT b.id, b.courier_user_id, d.municipality_id, b.business_date::text AS business_date, p.given_names, p.family_names,
             f.funding_mode_code AS funding_mode, f.is_closed,
             bal.courier_fees::text AS courier_fees, bal.commissions::text AS commissions, bal.settled_orders, bal.amount_due::text AS amount_due,
             cl.closed_at, cp.given_names AS closer_given, cp.family_names AS closer_family, cl.notes
      FROM cash_boxes b
      JOIN v_cash_box_funding f ON f.cash_box_id = b.id
      JOIN v_cash_box_balances bal ON bal.cash_box_id = b.id
      JOIN users u ON u.id = b.courier_user_id
      JOIN people p ON p.id = u.person_id
      LEFT JOIN v_courier_business_day d ON d.courier_user_id = b.courier_user_id
      LEFT JOIN cash_box_closures cl ON cl.cash_box_id = b.id
      LEFT JOIN users cu ON cu.id = cl.closed_by_user_id
      LEFT JOIN people cp ON cp.id = cu.person_id
      WHERE b.id = ${boxId}::uuid`;
    if (!head) return null;
    const [totals, movements, orders, uncollected] = await Promise.all([this.totals(boxId), this.movements(boxId), this.orders(boxId), this.uncollected(boxId)]);
    return {
      id: head.id,
      courierUserId: head.courier_user_id,
      municipalityId: head.municipality_id,
      businessDate: head.business_date,
      name: person(head.given_names, head.family_names),
      fundingMode: head.funding_mode,
      state: head.is_closed ? 'CLOSED' : 'OPEN',
      closure: head.closed_at ? { closedAt: head.closed_at, closedBy: person(head.closer_given ?? '', head.closer_family), notes: head.notes } : null,
      totals,
      courierFees: head.courier_fees,
      commissions: head.commissions,
      settledOrders: head.settled_orders,
      amountDue: head.amount_due,
      movements,
      orders,
      uncollected,
    };
  }

  private async totals(boxId: string): Promise<MovementTotal[]> {
    const rows = await this.prisma.$queryRaw<{ type: string; direction: number; total: string; count: number }[]>`
      SELECT t.code AS type, t.direction, sum(x.amount)::text AS total, count(*)::int AS count
      FROM cash_movements x JOIN cash_movement_types t ON t.id = x.movement_type_id
      WHERE x.cash_box_id = ${boxId}::uuid
      GROUP BY t.id ORDER BY t.sort_order`;
    return rows.map((r) => ({ ...r, direction: r.direction === 1 ? 1 : -1 }));
  }

  private async movements(boxId: string): Promise<BoxMovement[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        type: string;
        direction: number;
        amount: string;
        payment_method: string | null;
        order_code: string | null;
        note: string | null;
        created_at: Date;
        given_names: string | null;
        family_names: string | null;
        reverses_movement_id: string | null;
        reversed_by_id: string | null;
        is_correction: boolean;
      }[]
    >`
      SELECT x.id, t.code AS type, t.direction, x.amount::text AS amount, pm.code AS payment_method, o.code AS order_code, x.note,
             x.created_at, p.given_names, p.family_names, x.reverses_movement_id, r.id AS reversed_by_id, t.is_correction
      FROM cash_movements x
      JOIN cash_movement_types t ON t.id = x.movement_type_id
      LEFT JOIN payment_methods pm ON pm.id = x.payment_method_id
      LEFT JOIN orders o ON o.id = x.order_id
      LEFT JOIN users u ON u.id = x.created_by_user_id
      LEFT JOIN people p ON p.id = u.person_id
      LEFT JOIN cash_movements r ON r.reverses_movement_id = x.id
      WHERE x.cash_box_id = ${boxId}::uuid
      ORDER BY x.created_at, x.id`;
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      direction: r.direction === 1 ? 1 : -1,
      amount: r.amount,
      paymentMethod: r.payment_method,
      orderCode: r.order_code,
      note: r.note,
      createdAt: r.created_at,
      createdBy: r.given_names === null ? null : person(r.given_names, r.family_names),
      reversesMovementId: r.reverses_movement_id,
      reversedById: r.reversed_by_id,
      isCorrection: r.is_correction,
    }));
  }

  private orders(boxId: string): Promise<BoxOrder[]> {
    return this.prisma.$queryRaw<BoxOrder[]>`
      SELECT o.code, e.name AS "storeName", s.code AS status, a.customer_total::text AS "customerTotal",
             c.collected::text AS collected, a.delivery_fee::text AS "deliveryFee", a.commission_amount::text AS commission,
             (s.counts_as_delivered OR NOT s.is_terminal) AS counted
      FROM (SELECT x.order_id, sum(x.amount) AS collected, min(x.created_at) AS at FROM cash_movements x
            JOIN cash_movement_types t ON t.id = x.movement_type_id AND t.settles_order
            WHERE x.cash_box_id = ${boxId}::uuid GROUP BY x.order_id) c
      JOIN orders o ON o.id = c.order_id
      JOIN order_statuses s ON s.id = o.status_id
      JOIN establishments e ON e.id = o.establishment_id
      JOIN v_order_amounts a ON a.order_id = o.id
      ORDER BY c.at`;
  }

  /** Entregados (o con foto, o en disputa) por el dueño de la caja ese día, sin cobro en ninguna caja. */
  private uncollected(boxId: string): Promise<UncollectedOrder[]> {
    return this.prisma.$queryRaw<UncollectedOrder[]>`
      SELECT o.code, e.name AS "storeName", a.customer_total::text AS "customerTotal", h.occurred_at AS "closedAt"
      FROM cash_boxes b
      JOIN v_order_courier oc ON oc.courier_user_id = b.courier_user_id AND oc.released_at IS NOT NULL
      JOIN orders o ON o.id = oc.order_id
      JOIN order_statuses s ON s.id = o.status_id AND (s.counts_as_delivered OR NOT s.is_terminal)
      JOIN establishments e ON e.id = o.establishment_id
      JOIN municipalities m ON m.id = e.municipality_id
      JOIN v_order_amounts a ON a.order_id = o.id
      CROSS JOIN LATERAL (SELECT occurred_at FROM order_status_history WHERE order_id = o.id ORDER BY recorded_at DESC LIMIT 1) h
      WHERE b.id = ${boxId}::uuid AND (h.occurred_at AT TIME ZONE m.time_zone)::date = b.business_date
        AND NOT EXISTS (SELECT 1 FROM v_order_collections c WHERE c.order_id = o.id)
      ORDER BY h.occurred_at`;
  }

  async courierDay(courierUserId: string): Promise<CourierDay | null> {
    const [row] = await this.prisma.$queryRaw<
      { municipality_id: number; today: string; funding_mode: string | null; requires_opening: boolean; can_receive_offers: boolean; box_id: string | null }[]
    >`
      SELECT municipality_id, business_date::text AS today, funding_mode_code AS funding_mode, requires_box_opening AS requires_opening,
             can_receive_offers, cash_box_id AS box_id
      FROM v_courier_cash_readiness WHERE courier_user_id = ${courierUserId}::uuid`;
    return row
      ? {
          courierUserId,
          municipalityId: row.municipality_id,
          today: row.today,
          fundingMode: row.funding_mode,
          requiresOpening: row.requires_opening,
          canReceiveOffers: row.can_receive_offers,
          boxId: row.box_id,
        }
      : null;
  }

  async boxOn(courierUserId: string, businessDate: string): Promise<string | null> {
    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM cash_boxes WHERE courier_user_id = ${courierUserId}::uuid AND business_date = ${businessDate}::date`;
    return row?.id ?? null;
  }

  methods(): Promise<CashMethod[]> {
    return this.prisma.$queryRaw<CashMethod[]>`
      SELECT code, is_account_based AS "isAccountBased" FROM payment_methods
      WHERE deactivated_at IS NULL AND is_cash_on_delivery ORDER BY sort_order`;
  }

  async movementBox(movementId: string) {
    const [row] = await this.prisma.$queryRaw<{ box_id: string; courier_user_id: string; amount: string; direction: number }[]>`
      SELECT x.cash_box_id AS box_id, b.courier_user_id, x.amount::text AS amount, t.direction
      FROM cash_movements x JOIN cash_boxes b ON b.id = x.cash_box_id JOIN cash_movement_types t ON t.id = x.movement_type_id
      WHERE x.id = ${movementId}::uuid`;
    return row ? { boxId: row.box_id, courierUserId: row.courier_user_id, amount: row.amount, direction: (row.direction === 1 ? 1 : -1) as 1 | -1 } : null;
  }
}
