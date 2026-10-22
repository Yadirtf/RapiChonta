import { Injectable } from '@nestjs/common';
import { ROLES } from '../../identity/domain/identity.codes';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { COMPLETED_RELEASE, TRIP_SOURCES, TRIP_STATUSES } from '../domain/fulfillment.codes';
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

  reportNotReceived(customerUserId: string, code: string): Promise<CustomerDeliveryResult> {
    return this.change(customerUserId, code, [TRIP_STATUSES.PENDING_REVIEW], TRIP_STATUSES.DISPUTED);
  }

  private async change(customerUserId: string, code: string, from: string[], to: string): Promise<CustomerDeliveryResult> {
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
