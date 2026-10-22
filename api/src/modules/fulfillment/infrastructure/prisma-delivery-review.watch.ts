import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { DEFAULT_REVIEW_AUTO_CLOSE_SECONDS, FULFILLMENT_SETTINGS, TRIP_SOURCES, TRIP_STATUSES } from '../domain/fulfillment.codes';
import { DeliveryReviewWatch } from '../domain/ports/courier-trips';

/** Cuándo vence la revisión de cada entrega con foto: la hora en que entró a PENDING_REVIEW más el plazo del municipio. */
const DUE = Prisma.sql`
  (SELECT max(h.occurred_at) FROM order_status_history h WHERE h.order_id = o.id AND h.to_status_id = o.status_id)
  + make_interval(secs => coalesce((SELECT value::float8 FROM v_current_settings
                                    WHERE key = ${FULFILLMENT_SETTINGS.REVIEW_AUTO_CLOSE_SECONDS} AND municipality_id = e.municipality_id),
                                   ${DEFAULT_REVIEW_AUTO_CLOSE_SECONDS}))`;

/**
 * Entregas con foto que nadie reclamó en el plazo: pasan a DELIVERED con fuente TIMER (sin usuario ni rol). Un pedido
 * bloqueado en ese momento (el cliente está tocando "Recibí" o "No lo recibí") se salta y se revisa en la próxima pasada.
 */
@Injectable()
export class PrismaDeliveryReviewWatch extends DeliveryReviewWatch {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async closeDue(): Promise<number> {
    const [delivered, timer] = await Promise.all([this.ids.of('order_statuses', TRIP_STATUSES.DELIVERED), this.ids.of('status_change_sources', TRIP_SOURCES.TIMER)]);
    return this.prisma.$executeRaw`
      WITH due AS (
        SELECT o.id, o.status_id
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id AND s.code = ${TRIP_STATUSES.PENDING_REVIEW}
        JOIN establishments e ON e.id = o.establishment_id
        WHERE ${DUE} <= clock_timestamp()
        FOR UPDATE OF o SKIP LOCKED)
      INSERT INTO order_status_history (order_id, from_status_id, to_status_id, source_id)
      SELECT id, status_id, ${delivered}, ${timer} FROM due`;
  }

  async nextDueAt(): Promise<Date | null> {
    const [row] = await this.prisma.$queryRaw<{ next: Date | null }[]>`
      SELECT min(${DUE}) AS next
      FROM orders o
      JOIN order_statuses s ON s.id = o.status_id AND s.code = ${TRIP_STATUSES.PENDING_REVIEW}
      JOIN establishments e ON e.id = o.establishment_id`;
    return row?.next ?? null;
  }
}
