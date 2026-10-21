import { Injectable } from '@nestjs/common';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { SettingsReader } from '../../../shared/infrastructure/settings/settings.reader';
import {
  FULFILLMENT_SETTINGS,
  GEOFENCE_FRESH_SECONDS,
  GEOFENCE_MAX_ACCURACY_M,
  TRIP_SOURCES,
  TRIP_STATUSES,
  TripStatusCode,
} from '../domain/fulfillment.codes';
import { GeofenceProbe } from '../domain/ports/courier-trips';

/** Llegadas que detecta la ubicación: al local (área dibujada en el panel) y donde el cliente (a N metros). */
const ARRIVALS: Partial<Record<string, TripStatusCode>> = {
  [TRIP_STATUSES.ACCEPTED]: TRIP_STATUSES.AT_ESTABLISHMENT,
  [TRIP_STATUSES.ON_THE_WAY]: TRIP_STATUSES.ARRIVING,
};

const DEFAULT_READINGS = 2;
const DEFAULT_ARRIVING_METERS = 80;

/**
 * Docs/14 E08 "Geocercas", todo en el servidor y con las lecturas ya guardadas (el teléfono no decide):
 * - Local (H08.3): las últimas N lecturas (geofence.consecutive_readings), todas posteriores al cambio de estado,
 *   recientes y con precisión ≤ 50 m, deben estar dentro del área (ST_Covers). Con menos de N no hay llegada.
 * - Cliente (H08.6): la última lectura válida a menos de delivery.arriving_meters del punto de entrega (ST_DWithin).
 * La llegada es un cambio de estado con fuente GEOFENCE en order_status_history; no hay tabla de eventos.
 */
@Injectable()
export class PrismaGeofenceProbe extends GeofenceProbe {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
    private readonly settings: SettingsReader,
  ) {
    super();
  }

  async evaluate(courierUserId: string): Promise<{ orderCode: string; status: string } | null> {
    const [trip] = await this.prisma.$queryRaw<{ order_id: string; code: string; status: string }[]>`
      SELECT o.id AS order_id, o.code, s.code AS status
      FROM order_assignments a JOIN orders o ON o.id = a.order_id JOIN order_statuses s ON s.id = o.status_id
      WHERE a.courier_user_id = ${courierUserId}::uuid AND a.released_at IS NULL`;
    const target = trip ? ARRIVALS[trip.status] : undefined;
    if (!trip || !target) return null;

    const readings = Math.max(1, Math.trunc(await this.settings.number(FULFILLMENT_SETTINGS.CONSECUTIVE_READINGS, DEFAULT_READINGS)));
    const [fromId, toId, source] = await Promise.all([
      this.ids.of('order_statuses', trip.status),
      this.ids.of('order_statuses', target),
      this.ids.of('status_change_sources', TRIP_SOURCES.GEOFENCE),
    ]);

    // Se bloquea el pedido y se vuelve a mirar: dos lotes de lecturas a la vez no aplican la llegada dos veces,
    // y si el domiciliario (u otro cambio) se adelantó, no se hace nada.
    return this.prisma.$transaction(async (tx) => {
      const [arrived] = await tx.$queryRaw<{ arrived: boolean }[]>`
        WITH o AS (
          SELECT o.id, o.status_id, e.area, e.municipality_id, ad.location AS destination,
                 (SELECT max(h.occurred_at) FROM order_status_history h WHERE h.order_id = o.id AND h.to_status_id = o.status_id) AS since
          FROM orders o JOIN establishments e ON e.id = o.establishment_id JOIN addresses ad ON ad.id = o.delivery_address_id
          WHERE o.id = ${trip.order_id}::uuid AND o.status_id = ${fromId}
          FOR UPDATE OF o),
        recent AS (
          SELECT p.location, p.recorded_at FROM courier_location_pings p, o
          WHERE p.courier_user_id = ${courierUserId}::uuid
            AND p.accuracy_m <= ${GEOFENCE_MAX_ACCURACY_M}
            AND p.recorded_at >= o.since
            AND p.recorded_at > now() - make_interval(secs => ${GEOFENCE_FRESH_SECONDS})
          ORDER BY p.recorded_at DESC
          LIMIT ${target === TRIP_STATUSES.AT_ESTABLISHMENT ? readings : 1})
        SELECT CASE WHEN ${target} = ${TRIP_STATUSES.AT_ESTABLISHMENT}
                    THEN (SELECT count(*) = ${readings} AND bool_and(ST_Covers(o.area, r.location)) FROM recent r)
                    ELSE (SELECT coalesce(bool_and(ST_DWithin(r.location, o.destination, coalesce(
                            (SELECT value::float8 FROM v_current_settings
                             WHERE key = ${FULFILLMENT_SETTINGS.ARRIVING_METERS} AND municipality_id = o.municipality_id),
                            ${DEFAULT_ARRIVING_METERS}))), false) FROM recent r)
               END AS arrived
        FROM o`;
      if (!arrived?.arrived) return null;
      await tx.$executeRaw`
        INSERT INTO order_status_history (order_id, from_status_id, to_status_id, source_id)
        VALUES (${trip.order_id}::uuid, ${fromId}, ${toId}, ${source})`;
      return { orderCode: trip.code, status: target };
    });
  }
}
