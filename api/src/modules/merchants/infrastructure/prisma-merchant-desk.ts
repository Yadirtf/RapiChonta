import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { writeAudit } from '../../../shared/infrastructure/prisma/audit';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { TRIP_SOURCES } from '../../fulfillment/domain/fulfillment.codes';
import { ACCEPTED_NOTICE, MERCHANT_AUDIT, MERCHANT_MODE, MERCHANT_ORDER_STATUSES, ORDER_READY_NOTICE, STORE_STATUSES } from '../domain/merchants.codes';
import { CounterOrder, MerchantActor, MerchantDesk, MerchantResult, MerchantStore } from '../domain/ports/merchant-desk';

type Tx = Prisma.TransactionClient;

class Refused extends Error {
  constructor(
    readonly reason: Extract<MerchantResult, { ok: false }>['reason'],
    readonly status?: string,
  ) {
    super(reason);
  }
}

interface LockedOrder {
  id: string;
  status_id: number;
  status: string;
  terminal: boolean;
}

interface CounterRow {
  id: string;
  code: string;
  status: string;
  terminal: boolean;
  created_at: Date;
  accepted_at: Date | null;
  preparation_minutes: number | null;
  estimated_ready_at: Date | null;
  ready_at: Date | null;
  picked_up_at: Date | null;
  ended_at: Date | null;
  customer_given: string;
  customer_notes: string | null;
  items_total: string;
  courier_given: string | null;
  courier_phone: string | null;
  cancel_reason: string | null;
  cancel_by_merchant: boolean | null;
}

/**
 * El mostrador del comercio aliado. Cada acción bloquea el pedido, revisa con él bloqueado que sea un pedido directo
 * de un local que el usuario atiende y escribe todo en una transacción. Las reglas de fondo (quién acepta, en qué
 * estado, que el cambio a PENDING_ASSIGNMENT lleve aceptación) las vuelve a exigir la base.
 */
@Injectable()
export class PrismaMerchantDesk extends MerchantDesk {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async stores(userId: string): Promise<MerchantStore[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        status: string;
        accepts_orders: boolean;
        logo_file_id: string | null;
        municipality_id: number;
        municipality: string;
        time_zone: string;
        started_on: string;
        ended_on: string | null;
        waiting: number;
        preparing: number;
      }[]
    >`
      SELECT e.id, e.name, es.code AS status, es.accepts_orders, e.logo_file_id,
             m.id AS municipality_id, m.name AS municipality, m.time_zone,
             p.started_on::text AS started_on, p.ended_on::text AS ended_on,
             count(o.id) FILTER (WHERE os.code = ${MERCHANT_ORDER_STATUSES.AWAITING})::int AS waiting,
             count(o.id) FILTER (WHERE os.code <> ${MERCHANT_ORDER_STATUSES.AWAITING} AND mp.ready_at IS NULL)::int AS preparing
      FROM v_merchant_establishments me
      JOIN establishments e ON e.id = me.establishment_id
      JOIN establishment_statuses es ON es.id = e.status_id
      JOIN municipalities m ON m.id = e.municipality_id
      JOIN v_establishment_partners p ON p.establishment_id = e.id
      LEFT JOIN fulfillment_modes fm ON fm.code = ${MERCHANT_MODE}
      LEFT JOIN orders o ON o.establishment_id = e.id AND o.fulfillment_mode_id = fm.id
        AND NOT EXISTS (SELECT 1 FROM order_status_history h JOIN order_statuses t ON t.id = h.to_status_id AND t.code = ${MERCHANT_ORDER_STATUSES.PICKED_UP}
                        WHERE h.order_id = o.id)
      LEFT JOIN order_statuses os ON os.id = o.status_id AND NOT os.is_terminal
      LEFT JOIN v_merchant_order_preparation mp ON mp.order_id = o.id
      WHERE me.user_id = ${userId}::uuid
      GROUP BY e.id, es.code, es.accepts_orders, m.id, p.started_on, p.ended_on
      ORDER BY e.name`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      acceptsOrders: r.accepts_orders,
      logoFileId: r.logo_file_id,
      municipality: { id: r.municipality_id, name: r.municipality, timeZone: r.time_zone },
      partnership: { startedOn: r.started_on, endedOn: r.ended_on },
      waiting: r.waiting,
      preparing: r.preparing,
    }));
  }

  async counter(userId: string, establishmentId: string, closedHours: number): Promise<CounterOrder[] | null> {
    const [served] = await this.prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM v_merchant_establishments WHERE user_id = ${userId}::uuid AND establishment_id = ${establishmentId}::uuid) AS ok`;
    if (!served.ok) return null;
    const rows = await this.prisma.$queryRaw<CounterRow[]>`
      SELECT o.id, o.code, s.code AS status, s.is_terminal AS terminal, o.created_at,
             mp.accepted_at, mp.preparation_minutes, mp.estimated_ready_at, mp.ready_at,
             pu.at AS picked_up_at, CASE WHEN s.is_terminal THEN lc.at END AS ended_at,
             cp.given_names AS customer_given, o.customer_notes, a.items_total::text AS items_total,
             kp.given_names AS courier_given, kph.phone_e164 AS courier_phone,
             cr.code AS cancel_reason, cr.is_merchant_reason AS cancel_by_merchant
      FROM orders o
      JOIN fulfillment_modes fm ON fm.id = o.fulfillment_mode_id AND fm.code = ${MERCHANT_MODE}
      JOIN order_statuses s ON s.id = o.status_id
      JOIN users cu ON cu.id = o.customer_user_id
      JOIN people cp ON cp.id = cu.person_id
      JOIN v_order_amounts a ON a.order_id = o.id
      LEFT JOIN v_merchant_order_preparation mp ON mp.order_id = o.id
      LEFT JOIN LATERAL (SELECT min(h.occurred_at) AS at FROM order_status_history h
                         JOIN order_statuses t ON t.id = h.to_status_id AND t.code = ${MERCHANT_ORDER_STATUSES.PICKED_UP}
                         WHERE h.order_id = o.id) pu ON true
      LEFT JOIN LATERAL (SELECT max(h.occurred_at) AS at FROM order_status_history h WHERE h.order_id = o.id) lc ON true
      LEFT JOIN v_order_courier oc ON oc.order_id = o.id AND oc.released_at IS NULL
      LEFT JOIN users ku ON ku.id = oc.courier_user_id
      LEFT JOIN people kp ON kp.id = ku.person_id
      LEFT JOIN person_phones kph ON kph.person_id = kp.id AND kph.is_primary
      LEFT JOIN order_cancellations oca ON oca.order_id = o.id
      LEFT JOIN cancellation_reasons cr ON cr.id = oca.cancellation_reason_id
      WHERE o.establishment_id = ${establishmentId}::uuid
        AND ((NOT s.is_terminal AND pu.at IS NULL)
             OR coalesce(pu.at, lc.at) > now() - make_interval(hours => ${closedHours}))
      ORDER BY o.created_at`;
    if (!rows.length) return [];
    const lines = await this.prisma.$queryRaw<{ order_id: string; name: string; quantity: number; notes: string | null; prep_minutes: number }[]>`
      SELECT l.order_id, t.name, l.quantity::int AS quantity, l.notes, l.prep_minutes::int AS prep_minutes
      FROM v_order_lines l
      JOIN languages es ON es.code = 'es'
      JOIN product_version_texts t ON t.product_version_id = l.product_version_id AND t.language_id = es.id
      WHERE l.order_id = ANY(${rows.map((r) => r.id)}::uuid[]) AND NOT l.is_removed
      ORDER BY t.name`;
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      terminal: r.terminal,
      createdAt: r.created_at,
      closedAt: r.picked_up_at ?? r.ended_at,
      acceptedAt: r.accepted_at,
      preparationMinutes: r.preparation_minutes,
      estimatedReadyAt: r.estimated_ready_at,
      readyAt: r.ready_at,
      pickedUpAt: r.picked_up_at,
      customerName: r.customer_given.split(/\s+/)[0],
      customerNotes: r.customer_notes,
      lines: lines.filter((l) => l.order_id === r.id).map((l) => ({ name: l.name, quantity: l.quantity, notes: l.notes, prepMinutes: l.prep_minutes })),
      itemsTotal: r.items_total,
      courier: r.courier_given ? { givenNames: r.courier_given, phone: r.courier_phone } : null,
      cancellation: r.cancel_reason ? { reason: r.cancel_reason, byMerchant: Boolean(r.cancel_by_merchant) } : null,
    }));
  }

  async declineReasons(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ code: string }[]>`
      SELECT code FROM cancellation_reasons WHERE is_merchant_reason AND NOT is_automatic AND deactivated_at IS NULL ORDER BY sort_order`;
    return rows.map((r) => r.code);
  }

  accept(actor: MerchantActor, code: string, preparationMinutes: number): Promise<MerchantResult> {
    return this.run(actor, code, async (tx, order) => {
      if (order.status !== MERCHANT_ORDER_STATUSES.AWAITING) throw new Refused('STEP', order.status);
      await tx.$executeRaw`
        INSERT INTO merchant_order_acceptances (order_id, accepted_by_user_id, preparation_minutes)
        VALUES (${order.id}::uuid, ${actor.userId}::uuid, ${preparationMinutes})`;
      const historyId = await this.history(tx, actor, order, MERCHANT_ORDER_STATUSES.DISPATCH, null);
      // PENDING_ASSIGNMENT no avisa al cliente por sí solo (en la compra por RapiChonta es "buscando domiciliario");
      // aquí sí: la variante del texto sale del modo del pedido.
      await tx.$executeRaw`
        INSERT INTO notifications (recipient_user_id, notification_type_id, order_id, order_status_history_id)
        SELECT o.customer_user_id, t.id, o.id, ${historyId}::uuid
        FROM orders o JOIN notification_types t ON t.code = ${ACCEPTED_NOTICE} AND t.deactivated_at IS NULL
        WHERE o.id = ${order.id}::uuid`;
      return MERCHANT_ORDER_STATUSES.DISPATCH;
    });
  }

  decline(actor: MerchantActor, code: string, reason: string, notes: string | null): Promise<MerchantResult> {
    return this.run(actor, code, async (tx, order) => {
      if (order.status !== MERCHANT_ORDER_STATUSES.AWAITING) throw new Refused('STEP', order.status);
      const [row] = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM cancellation_reasons WHERE code = ${reason} AND is_merchant_reason AND NOT is_automatic AND deactivated_at IS NULL`;
      if (!row) throw new Refused('REASON');
      await tx.$executeRaw`INSERT INTO order_cancellations (order_id, cancellation_reason_id, notes) VALUES (${order.id}::uuid, ${row.id}, ${notes})`;
      await this.history(tx, actor, order, MERCHANT_ORDER_STATUSES.CANCELLED, notes);
      return MERCHANT_ORDER_STATUSES.CANCELLED;
    });
  }

  markReady(actor: MerchantActor, code: string): Promise<MerchantResult> {
    return this.run(actor, code, async (tx, order) => {
      const [state] = await tx.$queryRaw<{ accepted: boolean; ready: boolean; picked: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM merchant_order_acceptances WHERE order_id = ${order.id}::uuid) AS accepted,
               EXISTS (SELECT 1 FROM merchant_order_readiness WHERE order_id = ${order.id}::uuid) AS ready,
               EXISTS (SELECT 1 FROM order_status_history h JOIN order_statuses t ON t.id = h.to_status_id AND t.code = ${MERCHANT_ORDER_STATUSES.PICKED_UP}
                       WHERE h.order_id = ${order.id}::uuid) AS picked`;
      if (!state.accepted || state.picked || order.terminal) throw new Refused('STEP', order.status);
      // Dos toques seguidos (o dos pantallas abiertas): el segundo no falla, ya estaba listo.
      if (state.ready) return order.status;
      await tx.$executeRaw`INSERT INTO merchant_order_readiness (order_id, marked_by_user_id) VALUES (${order.id}::uuid, ${actor.userId}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO notifications (recipient_user_id, notification_type_id, order_id)
        SELECT oc.courier_user_id, t.id, oc.order_id
        FROM v_order_courier oc JOIN notification_types t ON t.code = ${ORDER_READY_NOTICE} AND t.deactivated_at IS NULL
        WHERE oc.order_id = ${order.id}::uuid AND oc.released_at IS NULL`;
      return order.status;
    });
  }

  async setOpen(actor: MerchantActor, establishmentId: string, open: boolean): Promise<MerchantResult> {
    const [from, to] = open ? [STORE_STATUSES.PAUSED, STORE_STATUSES.OPEN] : [STORE_STATUSES.OPEN, STORE_STATUSES.PAUSED];
    return this.guard(() =>
      this.prisma.$transaction(async (tx) => {
        const [store] = await tx.$queryRaw<{ status: string; orderable: number }[]>`
          SELECT s.code AS status,
                 (SELECT count(*)::int FROM v_menu WHERE establishment_id = e.id AND is_orderable) AS orderable
          FROM establishments e
          JOIN establishment_statuses s ON s.id = e.status_id
          JOIN v_merchant_establishments me ON me.establishment_id = e.id AND me.user_id = ${actor.userId}::uuid
          WHERE e.id = ${establishmentId}::uuid
          FOR UPDATE OF e`;
        if (!store) throw new Refused('NOT_FOUND');
        if (store.status === to) return to;
        if (store.status !== from) throw new Refused('STEP', store.status);
        if (open && store.orderable === 0) throw new Refused('MENU');
        await tx.$executeRaw`
          UPDATE establishments SET status_id = ${await this.ids.of('establishment_statuses', to)}, updated_at = now()
          WHERE id = ${establishmentId}::uuid`;
        await writeAudit(tx, {
          actorUserId: actor.userId,
          action: MERCHANT_AUDIT.ESTABLISHMENT_CHANGED,
          entityTable: 'establishments',
          entityId: establishmentId,
          changes: { status: { from, to }, via: 'merchant_portal' },
        });
        return to;
      }),
    );
  }

  /** Cambio de estado con el rol MERCHANT; devuelve el id de la fila del historial. */
  private async history(tx: Tx, actor: MerchantActor, order: LockedOrder, to: string, note: string | null): Promise<string> {
    const [toId, role, source] = await Promise.all([
      this.ids.of('order_statuses', to),
      this.ids.of('roles', actor.role),
      this.ids.of('status_change_sources', TRIP_SOURCES.USER_ACTION),
    ]);
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id, note)
      VALUES (${order.id}::uuid, ${order.status_id}, ${toId}, ${actor.userId}::uuid, ${role}, ${source}, ${note})
      RETURNING id`;
    return row.id;
  }

  /** Bloquea el pedido solo si es directo y de un local que el usuario atiende; si no, NOT_FOUND (no se revela). */
  private run(actor: MerchantActor, code: string, work: (tx: Tx, order: LockedOrder) => Promise<string>): Promise<MerchantResult> {
    return this.guard(() =>
      this.prisma.$transaction(async (tx) => {
        const [order] = await tx.$queryRaw<LockedOrder[]>`
          SELECT o.id, o.status_id, s.code AS status, s.is_terminal AS terminal
          FROM orders o
          JOIN order_statuses s ON s.id = o.status_id
          JOIN fulfillment_modes fm ON fm.id = o.fulfillment_mode_id AND fm.code = ${MERCHANT_MODE}
          JOIN v_merchant_establishments me ON me.establishment_id = o.establishment_id AND me.user_id = ${actor.userId}::uuid
          WHERE o.code = ${code}
          FOR UPDATE OF o`;
        if (!order) throw new Refused('NOT_FOUND');
        return work(tx, order);
      }),
    );
  }

  private async guard(transaction: () => Promise<string>): Promise<MerchantResult> {
    try {
      return { ok: true, status: await transaction() };
    } catch (error) {
      if (error instanceof Refused) return { ok: false, reason: error.reason, status: error.status };
      throw error;
    }
  }
}
