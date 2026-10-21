import { Injectable } from '@nestjs/common';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { LOCATION_RETENTION_SETTING, RECIPIENT_STATUSES, RETURN_SOURCES } from '../domain/dispatch.codes';
import { DISPATCH_ORDER_STATUSES } from '../domain/order-statuses';
import { DispatchMaintenance } from '../domain/ports/dispatch-maintenance';

@Injectable()
export class PrismaDispatchMaintenance extends DispatchMaintenance {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  /**
   * H07.4 en una transacción. Varias instancias pueden correrlo a la vez: marcar EXPIRED es condicional y el
   * regreso al panel bloquea cada pedido y vuelve a mirar (si alguien aceptó justo antes, ya no está OFFERED).
   */
  async expireOffers(): Promise<number> {
    const [expired, offered, timer] = await Promise.all([
      this.ids.of('offer_recipient_statuses', RECIPIENT_STATUSES.EXPIRED),
      this.ids.of('order_statuses', DISPATCH_ORDER_STATUSES.OFFERED),
      this.ids.of('status_change_sources', RETURN_SOURCES.TIMER),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const touched = await tx.$queryRaw<{ order_id: string }[]>`
        WITH expired AS (
          UPDATE order_offer_recipients r SET status_id = ${expired}, responded_at = o.expires_at
          FROM order_offers o, offer_recipient_statuses s
          WHERE o.id = r.order_offer_id AND s.id = r.status_id AND s.is_initial AND o.expires_at <= clock_timestamp()
          RETURNING o.order_id)
        SELECT DISTINCT order_id FROM expired`;
      if (!touched.length) return 0;
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM orders WHERE id = ANY(${touched.map((t) => t.order_id)}::uuid[]) AND status_id = ${offered} ORDER BY id FOR UPDATE`;
      if (!locked.length) return 0;
      return tx.$executeRaw`
        INSERT INTO order_status_history (order_id, from_status_id, to_status_id, source_id)
        SELECT o.id, ${offered}, initial.id, ${timer}
        FROM orders o CROSS JOIN order_statuses initial
        WHERE o.id = ANY(${locked.map((l) => l.id)}::uuid[]) AND o.status_id = ${offered}
          AND initial.is_initial AND initial.deactivated_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM v_live_offers lo WHERE lo.order_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM order_assignments a WHERE a.order_id = o.id AND a.released_at IS NULL)`;
    });
  }

  async nextExpiry(): Promise<Date | null> {
    const [row] = await this.prisma.$queryRaw<{ next: Date | null }[]>`SELECT min(expires_at) AS next FROM v_live_offers`;
    return row?.next ?? null;
  }

  async purgeLocations(): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM courier_location_pings
      WHERE received_at < now() - make_interval(days => coalesce(
        (SELECT value::int FROM v_current_settings WHERE key = ${LOCATION_RETENTION_SETTING} AND municipality_id IS NULL), 30))`;
  }
}
