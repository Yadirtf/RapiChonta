import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { ROLES } from '../../identity/domain/identity.codes';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { ADJUSTMENT_DECISIONS, ADJUSTMENT_NOTICES, adjustmentOutcome, decisionOptions, SubstituteCandidate } from '../domain/adjustments';
import { TRIP_SOURCES, TRIP_STATUSES, TRIP_CANCELLED_NOTICE, CANCELLED_RELEASE } from '../domain/fulfillment.codes';
import { DecideInput, DecideResult, OrderAdjustments } from '../domain/ports/adjustments';
import { decisionRules } from './adjustment-read';

type Tx = Prisma.TransactionClient;

/** Quién cierra la consulta: el cliente con su última decisión, o el sistema al vencer (sin usuario ni rol). */
type Actor = { userId: string } | null;

/**
 * H09.3 y el vencimiento. La decisión se escribe con `UPDATE ... WHERE decided_at IS NULL` y el pedido bloqueado:
 * si el cliente y el reloj llegan a la vez, gana el primero y el otro no encuentra nada pendiente.
 */
@Injectable()
export class PrismaOrderAdjustments extends OrderAdjustments {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async linePrices(orderId: string): Promise<Map<string, string>> {
    const rows = await this.prisma.$queryRaw<{ id: string; price: string }[]>`
      SELECT order_item_id AS id, unit_price::text AS price FROM v_order_lines WHERE order_id = ${orderId}::uuid AND NOT is_removed`;
    return new Map(rows.map((r) => [r.id, r.price]));
  }

  async decide(input: DecideInput): Promise<DecideResult> {
    return this.prisma.$transaction(async (tx) => {
      const [line] = await tx.$queryRaw<
        { order_id: string; establishment_id: string; status: string; request_id: string; decided: boolean; requires_price: boolean; quantity: number }[]
      >`
        SELECT o.id AS order_id, o.establishment_id, s.code AS status, x.request_id, x.decided_at IS NOT NULL AS decided,
               r.requires_price, i.quantity::int AS quantity
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id
        JOIN order_item_adjustments x ON x.order_id = o.id AND x.id = ${input.adjustmentId}::uuid
        JOIN adjustment_reasons r ON r.id = x.reason_id
        JOIN order_items i ON i.id = x.order_item_id
        WHERE o.code = ${input.orderCode} AND o.customer_user_id = ${input.customerUserId}::uuid
        FOR UPDATE OF o`;
      if (!line) return { ok: false, reason: 'NOT_FOUND' };
      if (line.status !== TRIP_STATUSES.AWAITING_CUSTOMER) return { ok: false, reason: 'STEP', status: line.status };
      if (line.decided) return { ok: false, reason: 'DECIDED', status: line.status };

      const rules = await decisionRules(tx);
      const rule = rules.find((r) => r.code === input.decision);
      if (!rule || !decisionOptions(rules, line.requires_price).includes(rule.code)) return { ok: false, reason: 'OPTION', status: line.status };

      let substituteVersionId: string | null = null;
      if (rule.createsSubstitute) {
        // Lo que se puede pedir hoy en ese local, en su versión vigente, y que no esté ya en el pedido.
        const [pick] = await tx.$queryRaw<{ id: string }[]>`
          SELECT m.product_version_id AS id FROM v_menu m
          WHERE m.product_version_id = ${input.productVersionId ?? null}::uuid AND m.establishment_id = ${line.establishment_id}::uuid AND m.is_orderable
            AND NOT EXISTS (SELECT 1 FROM v_order_lines l WHERE l.order_id = ${line.order_id}::uuid AND NOT l.is_removed AND l.product_id = m.product_id)`;
        if (!pick) return { ok: false, reason: 'SUBSTITUTE', status: line.status };
        substituteVersionId = pick.id;
      }

      const decision = await this.ids.of('adjustment_decisions', rule.code);
      // Cancelar responde por toda la consulta: no tiene sentido decidir las demás líneas de un pedido que no sigue.
      if (rule.cancelsOrder) {
        await tx.$executeRaw`
          UPDATE order_item_adjustments SET decision_id = ${decision}, decided_by_user_id = ${input.customerUserId}::uuid, decided_at = clock_timestamp()
          WHERE request_id = ${line.request_id}::uuid AND decided_at IS NULL`;
      } else {
        await tx.$executeRaw`
          UPDATE order_item_adjustments SET decision_id = ${decision}, decided_by_user_id = ${input.customerUserId}::uuid, decided_at = clock_timestamp()
          WHERE id = ${input.adjustmentId}::uuid AND decided_at IS NULL`;
      }
      if (substituteVersionId) {
        await tx.$executeRaw`
          INSERT INTO order_items (order_id, product_version_id, quantity, origin_adjustment_id)
          VALUES (${line.order_id}::uuid, ${substituteVersionId}::uuid, ${line.quantity}, ${input.adjustmentId}::uuid)`;
      }
      const status = await this.settle(tx, line.order_id, line.request_id, { userId: input.customerUserId });
      return { ok: true, status, resolved: status !== TRIP_STATUSES.AWAITING_CUSTOMER };
    });
  }

  async substitutes(customerUserId: string, orderCode: string, adjustmentId: string, language: string) {
    const [line] = await this.prisma.$queryRaw<
      { order_id: string; establishment_id: string; product_id: string; menu_section_id: string; unit_price: string }[]
    >`
      SELECT o.id AS order_id, o.establishment_id, p.id AS product_id, p.menu_section_id, v.price::text AS unit_price
      FROM orders o
      JOIN order_statuses s ON s.id = o.status_id AND s.code = ${TRIP_STATUSES.AWAITING_CUSTOMER}
      JOIN order_item_adjustments x ON x.order_id = o.id AND x.id = ${adjustmentId}::uuid AND x.decided_at IS NULL
      JOIN order_items i ON i.id = x.order_item_id
      JOIN product_versions v ON v.id = i.product_version_id
      JOIN products p ON p.id = v.product_id
      WHERE o.code = ${orderCode} AND o.customer_user_id = ${customerUserId}::uuid`;
    if (!line) return null;
    const [candidates, inOrder] = await Promise.all([
      this.prisma.$queryRaw<SubstituteCandidate[]>`
        SELECT m.product_id AS "productId", m.product_version_id AS "productVersionId", m.menu_section_id AS "menuSectionId",
               coalesce(tl.name, te.name) AS name, m.price::text AS price, m.primary_image_file_id AS "imageFileId"
        FROM v_menu m
        JOIN languages les ON les.code = 'es'
        LEFT JOIN languages ll ON ll.code = ${language}
        JOIN product_version_texts te ON te.product_version_id = m.product_version_id AND te.language_id = les.id
        LEFT JOIN product_version_texts tl ON tl.product_version_id = m.product_version_id AND tl.language_id = ll.id
        WHERE m.establishment_id = ${line.establishment_id}::uuid AND m.is_orderable`,
      this.prisma.$queryRaw<{ product_id: string }[]>`
        SELECT product_id FROM v_order_lines WHERE order_id = ${line.order_id}::uuid AND NOT is_removed`,
    ]);
    return {
      original: { productId: line.product_id, menuSectionId: line.menu_section_id, unitPrice: line.unit_price },
      inOrder: new Set(inOrder.map((r) => r.product_id)),
      candidates,
    };
  }

  /**
   * Cada consulta vencida en su propia transacción: un pedido bloqueado (el cliente está decidiendo justo ahora) se
   * salta y se revisa en la próxima pasada.
   */
  async expireDue(): Promise<number> {
    const due = await this.prisma.$queryRaw<{ request_id: string; order_id: string }[]>`
      SELECT req.id AS request_id, req.order_id FROM order_adjustment_requests req
      WHERE req.expires_at <= clock_timestamp()
        AND EXISTS (SELECT 1 FROM order_item_adjustments x WHERE x.request_id = req.id AND x.decided_at IS NULL)`;
    if (!due.length) return 0;
    const expired = await this.ids.of('adjustment_decisions', ADJUSTMENT_DECISIONS.EXPIRED_REMOVED);
    let settled = 0;
    for (const { request_id, order_id } of due) {
      const done = await this.prisma.$transaction(async (tx) => {
        const [order] = await tx.$queryRaw<{ status: string }[]>`
          SELECT s.code AS status FROM orders o JOIN order_statuses s ON s.id = o.status_id
          WHERE o.id = ${order_id}::uuid FOR UPDATE OF o SKIP LOCKED`;
        if (order?.status !== TRIP_STATUSES.AWAITING_CUSTOMER) return false;
        const changed = await tx.$executeRaw`
          UPDATE order_item_adjustments SET decision_id = ${expired}, decided_at = clock_timestamp()
          WHERE request_id = ${request_id}::uuid AND decided_at IS NULL`;
        if (!changed) return false;
        await this.settle(tx, order_id, request_id, null);
        return true;
      });
      if (done) settled++;
    }
    return settled;
  }

  async nextDueAt(): Promise<Date | null> {
    const [row] = await this.prisma.$queryRaw<{ next: Date | null }[]>`
      SELECT min(req.expires_at) AS next FROM order_adjustment_requests req
      WHERE EXISTS (SELECT 1 FROM order_item_adjustments x WHERE x.request_id = req.id AND x.decided_at IS NULL)`;
    return row?.next ?? null;
  }

  /**
   * Con la última decisión, el pedido sale de AWAITING_CUSTOMER: vuelve a la compra o se cancela (con su motivo, y
   * la asignación liberada). El domiciliario recibe el aviso; el cliente, el del estado (si no fue él quien decidió).
   */
  private async settle(tx: Tx, orderId: string, requestId: string, actor: Actor): Promise<string> {
    const [tally] = await tx.$queryRaw<{ pending: number; cancelled: boolean; effective_lines: number }[]>`
      SELECT (SELECT count(*)::int FROM order_item_adjustments WHERE request_id = ${requestId}::uuid AND decided_at IS NULL) AS pending,
             EXISTS (SELECT 1 FROM order_item_adjustments x JOIN adjustment_decisions d ON d.id = x.decision_id AND d.cancels_order
                     WHERE x.request_id = ${requestId}::uuid) AS cancelled,
             (SELECT count(*)::int FROM v_order_lines WHERE order_id = ${orderId}::uuid AND NOT is_removed) AS effective_lines`;
    const outcome = adjustmentOutcome({ pending: tally.pending, cancelled: tally.cancelled, effectiveLines: tally.effective_lines });
    if (outcome.kind === 'WAITING') return TRIP_STATUSES.AWAITING_CUSTOMER;

    const to = outcome.kind === 'RESUME' ? TRIP_STATUSES.AT_ESTABLISHMENT : TRIP_STATUSES.CANCELLED;
    await tx.$executeRaw`
      INSERT INTO notifications (recipient_user_id, notification_type_id, order_id)
      SELECT a.courier_user_id, t.id, a.order_id
      FROM order_assignments a JOIN notification_types t ON t.code = ${outcome.kind === 'RESUME' ? ADJUSTMENT_NOTICES.RESOLVED : TRIP_CANCELLED_NOTICE}
        AND t.deactivated_at IS NULL
      WHERE a.order_id = ${orderId}::uuid AND a.released_at IS NULL`;
    if (outcome.kind === 'CANCEL') {
      const [reason, release] = await Promise.all([this.ids.of('cancellation_reasons', outcome.reason), this.ids.of('assignment_release_reasons', CANCELLED_RELEASE)]);
      await tx.$executeRaw`INSERT INTO order_cancellations (order_id, cancellation_reason_id) VALUES (${orderId}::uuid, ${reason})`;
      // Sin released_by: no la liberó el personal (la auditoría del panel no la cuenta como reasignación).
      await tx.$executeRaw`
        UPDATE order_assignments SET released_at = clock_timestamp(), release_reason_id = ${release}
        WHERE order_id = ${orderId}::uuid AND released_at IS NULL`;
    }
    const [fromId, toId, source, role] = await Promise.all([
      this.ids.of('order_statuses', TRIP_STATUSES.AWAITING_CUSTOMER),
      this.ids.of('order_statuses', to),
      this.ids.of('status_change_sources', actor ? TRIP_SOURCES.USER_ACTION : TRIP_SOURCES.TIMER),
      actor ? this.ids.of('roles', ROLES.CUSTOMER) : Promise.resolve(null),
    ]);
    await tx.$executeRaw`
      INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id)
      VALUES (${orderId}::uuid, ${fromId}, ${toId}, ${actor?.userId ?? null}::uuid, ${role}, ${source})`;
    return to;
  }
}
