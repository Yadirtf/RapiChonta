import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { PREPARATION_NOTICE, TRIP_STATUSES } from '../domain/fulfillment.codes';
import { PreparationWatch } from '../domain/ports/courier-trips';

/** Llave del candado de la revisión: con varias instancias de la API, una sola encola los avisos a la vez. */
const WATCH_LOCK = 0x52430508;

/**
 * H08.5: al cumplirse la revisión (hora estimada o, si ya dijo "Sigue en preparación", recheck después de la
 * última) se encola PREPARATION_TIME_REACHED para el domiciliario del pedido. Nada nuevo se guarda: "ya avisado"
 * es que exista ese aviso del pedido creado después de la revisión que venció.
 */
@Injectable()
export class PrismaPreparationWatch extends PreparationWatch {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async notifyDue(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${WATCH_LOCK}) AS ok`;
      if (!lock.ok) return 0;
      return tx.$executeRaw`
        INSERT INTO notifications (recipient_user_id, notification_type_id, order_id)
        SELECT a.courier_user_id, t.id, o.id
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id AND s.code = ${TRIP_STATUSES.PREPARING}
        JOIN v_order_preparation p ON p.order_id = o.id
        JOIN order_assignments a ON a.order_id = o.id AND a.released_at IS NULL
        JOIN notification_types t ON t.code = ${PREPARATION_NOTICE} AND t.deactivated_at IS NULL
        WHERE p.next_check_at <= clock_timestamp()
          AND NOT EXISTS (SELECT 1 FROM notifications n
                          WHERE n.order_id = o.id AND n.notification_type_id = t.id AND n.created_at >= p.next_check_at)`;
    });
  }

  async nextCheckAt(): Promise<Date | null> {
    const [row] = await this.prisma.$queryRaw<{ next: Date | null }[]>`
      SELECT min(p.next_check_at) AS next
      FROM orders o
      JOIN order_statuses s ON s.id = o.status_id AND s.code = ${TRIP_STATUSES.PREPARING}
      JOIN v_order_preparation p ON p.order_id = o.id
      WHERE NOT EXISTS (SELECT 1 FROM notifications n JOIN notification_types t ON t.id = n.notification_type_id AND t.code = ${PREPARATION_NOTICE}
                        WHERE n.order_id = o.id AND n.created_at >= p.next_check_at)`;
    return row?.next ?? null;
  }
}
