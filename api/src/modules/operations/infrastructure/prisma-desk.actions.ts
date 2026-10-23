import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { CANCELLATION_REASONS } from '../../fulfillment/domain/adjustments';
import { CANCELLED_RELEASE, TRIP_CANCELLED_NOTICE, TRIP_SOURCES, TRIP_STATUSES } from '../../fulfillment/domain/fulfillment.codes';
import { INCIDENT_NOTICES, INCIDENT_RESOLUTIONS, INCIDENT_STATUSES, resolutionFits } from '../../fulfillment/domain/incidents';
import { PROOF_OUTCOMES, ProofOutcome } from '../domain/operations.codes';
import { DeskActions, DeskResult, StaffActor } from '../domain/ports/desk';

type Tx = Prisma.TransactionClient;

class Refused extends Error {
  constructor(
    readonly reason: Extract<DeskResult, { ok: false }>['reason'],
    readonly status?: string,
  ) {
    super(reason);
  }
}

interface LockedOrder {
  id: string;
  status_id: number;
  status: string;
}

/**
 * Lo que hace el personal desde el panel de pedidos (H10.5). Cada acción bloquea el pedido, revisa el paso con el
 * pedido ya bloqueado y escribe todo en una transacción; las reglas de fondo (quién puede cada cambio, disputa ⇔
 * novedad abierta, motivo de toda cancelación) las vuelve a exigir la base.
 */
@Injectable()
export class PrismaDeskActions extends DeskActions {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  cancel(actor: StaffActor, code: string, reason: string, notes: string): Promise<DeskResult> {
    return this.run(code, async (tx, order) => {
      const [check] = await tx.$queryRaw<{ allowed: boolean; reason_id: number | null }[]>`
        SELECT EXISTS (SELECT 1 FROM order_status_transition_roles tr
                       WHERE tr.from_status_id = ${order.status_id} AND tr.role_id = ${await this.ids.of('roles', actor.role)}
                         AND tr.to_status_id = ${await this.ids.of('order_statuses', TRIP_STATUSES.CANCELLED)}) AS allowed,
               (SELECT id FROM cancellation_reasons WHERE code = ${reason} AND NOT is_automatic AND deactivated_at IS NULL) AS reason_id`;
      if (!check.allowed) throw new Refused('STEP', order.status);
      if (check.reason_id === null) throw new Refused('REASON');
      // Las ofertas pendientes se retiran (el disparador avisa OFFER_WITHDRAWN a cada domiciliario).
      await tx.$executeRaw`
        UPDATE order_offer_recipients r SET status_id = ${await this.ids.of('offer_recipient_statuses', 'WITHDRAWN')}, responded_at = clock_timestamp()
        FROM order_offers o, offer_recipient_statuses s
        WHERE o.id = r.order_offer_id AND s.id = r.status_id AND s.is_initial AND o.order_id = ${order.id}::uuid`;
      await this.releaseWithNotice(tx, order.id, actor.userId);
      await tx.$executeRaw`
        INSERT INTO order_cancellations (order_id, cancellation_reason_id, notes) VALUES (${order.id}::uuid, ${check.reason_id}, ${notes})`;
      await this.history(tx, actor, order, TRIP_STATUSES.CANCELLED, notes);
      return TRIP_STATUSES.CANCELLED;
    });
  }

  reviewProof(actor: StaffActor, code: string, outcome: ProofOutcome, note: string, incidentType: string): Promise<DeskResult> {
    return this.run(code, async (tx, order) => {
      if (order.status !== TRIP_STATUSES.PENDING_REVIEW) throw new Refused('STEP', order.status);
      if (outcome === PROOF_OUTCOMES.DELIVERED) {
        await this.history(tx, actor, order, TRIP_STATUSES.DELIVERED, note);
        return TRIP_STATUSES.DELIVERED;
      }
      // Un caso abierto por el personal: lo tiene quien lo abrió, y el domiciliario sabe que lo están revisando.
      const [type] = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM incident_types WHERE code = ${incidentType} AND opens_dispute AND deactivated_at IS NULL`;
      if (!type) throw new Refused('TYPE');
      const [open, review] = await Promise.all([this.ids.of('incident_statuses', INCIDENT_STATUSES.OPEN), this.ids.of('incident_statuses', INCIDENT_STATUSES.IN_REVIEW)]);
      const [incident] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO incidents (order_id, incident_type_id, reported_by_user_id, description, status_id)
        VALUES (${order.id}::uuid, ${type.id}, ${actor.userId}::uuid, ${note}, ${open}) RETURNING id`;
      await tx.$executeRaw`INSERT INTO incident_status_history (incident_id, to_status_id, changed_by_user_id) VALUES (${incident.id}::uuid, ${open}, ${actor.userId}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO incident_status_history (incident_id, from_status_id, to_status_id, changed_by_user_id)
        VALUES (${incident.id}::uuid, ${open}, ${review}, ${actor.userId}::uuid)`;
      const disputed = await this.history(tx, actor, order, TRIP_STATUSES.DISPUTED, note);
      if (outcome === PROOF_OUTCOMES.INVESTIGATE) {
        await this.notifyCourier(tx, order.id, INCIDENT_NOTICES.OPENED);
        return TRIP_STATUSES.DISPUTED;
      }
      return this.settle(tx, actor, disputed, incident.id, review, INCIDENT_RESOLUTIONS.RESOLVED_AS_CANCELLED, note);
    });
  }

  async takeIncident(actor: StaffActor, incidentId: string): Promise<DeskResult> {
    const [open, review] = await Promise.all([this.ids.of('incident_statuses', INCIDENT_STATUSES.OPEN), this.ids.of('incident_statuses', INCIDENT_STATUSES.IN_REVIEW)]);
    return this.runIncident(incidentId, async (tx, order, incident) => {
      if (incident.status_id !== open) throw new Refused('CLOSED', incident.status);
      await tx.$executeRaw`
        INSERT INTO incident_status_history (incident_id, from_status_id, to_status_id, changed_by_user_id)
        VALUES (${incidentId}::uuid, ${open}, ${review}, ${actor.userId}::uuid)`;
      return order.status;
    });
  }

  resolveIncident(actor: StaffActor, incidentId: string, resolution: string, note: string): Promise<DeskResult> {
    return this.runIncident(incidentId, async (tx, order, incident) => {
      if (incident.terminal) throw new Refused('CLOSED', incident.status);
      return this.settle(tx, actor, order, incidentId, incident.status_id, resolution, note);
    });
  }

  /**
   * Cierra la novedad con su resolución y, si la deja en un estado, saca al pedido de la disputa: cancelado con el
   * motivo INCIDENT_RESOLUTION y el comentario. Avisa a los dos con la resolución como variante del texto.
   */
  private async settle(tx: Tx, actor: StaffActor, order: LockedOrder, incidentId: string, fromStatusId: number, resolution: string, note: string): Promise<string> {
    const [rule] = await tx.$queryRaw<{ id: number; resulting: string | null; opens_dispute: boolean }[]>`
      SELECT rt.id, os.code AS resulting, it.opens_dispute
      FROM incident_resolution_types rt
      LEFT JOIN order_statuses os ON os.id = rt.resulting_order_status_id
      JOIN incidents i ON i.id = ${incidentId}::uuid
      JOIN incident_types it ON it.id = i.incident_type_id
      WHERE rt.code = ${resolution} AND rt.deactivated_at IS NULL`;
    if (!rule || !resolutionFits(rule.opens_dispute, rule.resulting)) throw new Refused('RESOLUTION');
    await tx.$executeRaw`UPDATE incidents SET resolution_type_id = ${rule.id}, resolution_notes = ${note} WHERE id = ${incidentId}::uuid`;
    await tx.$executeRaw`
      INSERT INTO incident_status_history (incident_id, from_status_id, to_status_id, changed_by_user_id)
      VALUES (${incidentId}::uuid, ${fromStatusId}, ${await this.ids.of('incident_statuses', INCIDENT_STATUSES.RESOLVED)}, ${actor.userId}::uuid)`;
    let status = order.status;
    if (rule.resulting && order.status === TRIP_STATUSES.DISPUTED) {
      if (rule.resulting === TRIP_STATUSES.CANCELLED) {
        await tx.$executeRaw`
          INSERT INTO order_cancellations (order_id, cancellation_reason_id, notes)
          VALUES (${order.id}::uuid, ${await this.ids.of('cancellation_reasons', CANCELLATION_REASONS.INCIDENT_RESOLUTION)}, ${note})`;
      }
      await this.history(tx, actor, order, rule.resulting, note);
      status = rule.resulting;
    }
    await tx.$executeRaw`
      INSERT INTO notifications (recipient_user_id, notification_type_id, order_id, params)
      SELECT x.user_id, t.id, o.id, ${JSON.stringify({ variant: resolution })}::jsonb
      FROM orders o
      CROSS JOIN LATERAL (SELECT o.customer_user_id AS user_id
                          UNION SELECT oc.courier_user_id FROM v_order_courier oc WHERE oc.order_id = o.id) x
      JOIN notification_types t ON t.code = ${INCIDENT_NOTICES.RESOLVED} AND t.deactivated_at IS NULL
      WHERE o.id = ${order.id}::uuid`;
    return status;
  }

  /** Si el domiciliario aún lo tiene, se libera y recibe TRIP_CANCELLED ("ya no tienes que comprarlo"). */
  private async releaseWithNotice(tx: Tx, orderId: string, byUserId: string): Promise<void> {
    await this.notifyCourier(tx, orderId, TRIP_CANCELLED_NOTICE, true);
    await tx.$executeRaw`
      UPDATE order_assignments SET released_at = clock_timestamp(), release_reason_id = ${await this.ids.of('assignment_release_reasons', CANCELLED_RELEASE)},
             released_by_user_id = ${byUserId}::uuid
      WHERE order_id = ${orderId}::uuid AND released_at IS NULL`;
  }

  private async notifyCourier(tx: Tx, orderId: string, type: string, holdingOnly = false): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO notifications (recipient_user_id, notification_type_id, order_id)
      SELECT oc.courier_user_id, t.id, oc.order_id
      FROM v_order_courier oc JOIN notification_types t ON t.code = ${type} AND t.deactivated_at IS NULL
      WHERE oc.order_id = ${orderId}::uuid AND (NOT ${holdingOnly} OR oc.released_at IS NULL)`;
  }

  /** Cambio de estado con el rol del personal y su comentario; devuelve el pedido en el estado nuevo. */
  private async history(tx: Tx, actor: StaffActor, order: LockedOrder, to: string, note: string): Promise<LockedOrder> {
    const [toId, role, source] = await Promise.all([
      this.ids.of('order_statuses', to),
      this.ids.of('roles', actor.role),
      this.ids.of('status_change_sources', TRIP_SOURCES.USER_ACTION),
    ]);
    await tx.$executeRaw`
      INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id, note)
      VALUES (${order.id}::uuid, ${order.status_id}, ${toId}, ${actor.userId}::uuid, ${role}, ${source}, ${note})`;
    return { id: order.id, status_id: toId, status: to };
  }

  private run(code: string, work: (tx: Tx, order: LockedOrder) => Promise<string>): Promise<DeskResult> {
    return this.guard(() =>
      this.prisma.$transaction(async (tx) => {
        const [order] = await tx.$queryRaw<LockedOrder[]>`
          SELECT o.id, o.status_id, s.code AS status FROM orders o JOIN order_statuses s ON s.id = o.status_id
          WHERE o.code = ${code} FOR UPDATE OF o`;
        if (!order) throw new Refused('NOT_FOUND');
        return work(tx, order);
      }),
    );
  }

  /** Bloquea el pedido de la novedad (como todo lo que cambia su estado) y lee la novedad con él bloqueado. */
  private runIncident(
    incidentId: string,
    work: (tx: Tx, order: LockedOrder, incident: { status_id: number; status: string; terminal: boolean }) => Promise<string>,
  ): Promise<DeskResult> {
    return this.guard(() =>
      this.prisma.$transaction(async (tx) => {
        const [order] = await tx.$queryRaw<LockedOrder[]>`
          SELECT o.id, o.status_id, s.code AS status FROM incidents i JOIN orders o ON o.id = i.order_id JOIN order_statuses s ON s.id = o.status_id
          WHERE i.id = ${incidentId}::uuid FOR UPDATE OF o`;
        if (!order) throw new Refused('NOT_FOUND');
        const [incident] = await tx.$queryRaw<{ status_id: number; status: string; terminal: boolean }[]>`
          SELECT i.status_id, s.code AS status, s.is_terminal AS terminal FROM incidents i JOIN incident_statuses s ON s.id = i.status_id
          WHERE i.id = ${incidentId}::uuid`;
        return work(tx, order, incident);
      }),
    );
  }

  private async guard(transaction: () => Promise<string>): Promise<DeskResult> {
    try {
      return { ok: true, status: await transaction() };
    } catch (error) {
      if (error instanceof Refused) return { ok: false, reason: error.reason, status: error.status };
      throw error;
    }
  }
}
