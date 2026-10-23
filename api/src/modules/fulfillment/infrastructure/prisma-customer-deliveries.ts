import { Injectable } from '@nestjs/common';
import { ROLES } from '../../identity/domain/identity.codes';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { COMPLETED_RELEASE, TRIP_SOURCES, TRIP_STATUSES } from '../domain/fulfillment.codes';
import { INCIDENT_NOTICES, INCIDENT_STATUSES, INCIDENT_TYPES } from '../domain/incidents';
import { CustomerDeliveries, CustomerDeliveryResult } from '../domain/ports/courier-trips';

/**
 * El cliente al final del pedido. Se bloquea el pedido (solo si es suyo) y se cambia el estado con su rol; si el
 * domiciliario aún lo tenía asignado, se libera en la misma transacción (el pedido ya no lo exige).
 */
@Injectable()
export class PrismaCustomerDeliveries extends CustomerDeliveries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  confirmReceived(customerUserId: string, code: string): Promise<CustomerDeliveryResult> {
    return this.change(customerUserId, code, [TRIP_STATUSES.ON_THE_WAY, TRIP_STATUSES.ARRIVING, TRIP_STATUSES.PENDING_REVIEW], TRIP_STATUSES.DELIVERED);
  }

  /**
   * La novedad nace antes del cambio de estado (la base exige que todo pedido en DISPUTED tenga una abierta) y el
   * domiciliario que lo dejó recibe el aviso: RapiChonta lo va a llamar.
   */
  async reportNotReceived(customerUserId: string, code: string, description: string | null): Promise<CustomerDeliveryResult> {
    const [type, open] = await Promise.all([this.ids.of('incident_types', INCIDENT_TYPES.NOT_RECEIVED), this.ids.of('incident_statuses', INCIDENT_STATUSES.OPEN)]);
    return this.change(customerUserId, code, [TRIP_STATUSES.PENDING_REVIEW], TRIP_STATUSES.DISPUTED, async (tx, orderId) => {
      const [incident] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO incidents (order_id, incident_type_id, reported_by_user_id, description, status_id)
        VALUES (${orderId}::uuid, ${type}, ${customerUserId}::uuid, ${description}, ${open}) RETURNING id`;
      await tx.$executeRaw`
        INSERT INTO incident_status_history (incident_id, to_status_id, changed_by_user_id) VALUES (${incident.id}::uuid, ${open}, ${customerUserId}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO notifications (recipient_user_id, notification_type_id, order_id)
        SELECT oc.courier_user_id, t.id, oc.order_id
        FROM v_order_courier oc JOIN notification_types t ON t.code = ${INCIDENT_NOTICES.OPENED} AND t.deactivated_at IS NULL
        WHERE oc.order_id = ${orderId}::uuid`;
    });
  }

  private async change(
    customerUserId: string,
    code: string,
    from: string[],
    to: string,
    before?: (tx: Prisma.TransactionClient, orderId: string) => Promise<void>,
  ): Promise<CustomerDeliveryResult> {
    const [toId, role, source, reason] = await Promise.all([
      this.ids.of('order_statuses', to),
      this.ids.of('roles', ROLES.CUSTOMER),
      this.ids.of('status_change_sources', TRIP_SOURCES.USER_ACTION),
      this.ids.of('assignment_release_reasons', COMPLETED_RELEASE),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<{ id: string; status_id: number; status: string }[]>`
        SELECT o.id, o.status_id, s.code AS status
        FROM orders o JOIN order_statuses s ON s.id = o.status_id
        WHERE o.code = ${code} AND o.customer_user_id = ${customerUserId}::uuid
        FOR UPDATE OF o`;
      if (!order) return { ok: false, reason: 'NOT_FOUND' };
      // Repetir el toque (o llegar después del domiciliario con el código) no es un error.
      if (order.status === to) return { ok: true, status: to, changed: false };
      if (!from.includes(order.status)) return { ok: false, reason: 'STEP', status: order.status };
      await before?.(tx, order.id);
      await tx.$executeRaw`
        UPDATE order_assignments SET released_at = clock_timestamp(), release_reason_id = ${reason}, released_by_user_id = ${customerUserId}::uuid
        WHERE order_id = ${order.id}::uuid AND released_at IS NULL`;
      await tx.$executeRaw`
        INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by_user_id, acting_role_id, source_id)
        VALUES (${order.id}::uuid, ${order.status_id}, ${toId}, ${customerUserId}::uuid, ${role}, ${source})`;
      return { ok: true, status: to, changed: true };
    });
  }
}
