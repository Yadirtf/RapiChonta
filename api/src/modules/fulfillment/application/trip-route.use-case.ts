import { Injectable } from '@nestjs/common';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { Principal } from '../../identity/domain/principal';
import { TRIP_STATUSES } from '../domain/fulfillment.codes';
import { FulfillmentErrors } from '../domain/fulfillment.errors';
import { CourierTrips } from '../domain/ports/courier-trips';
import { PlannedRoute, RoutePlanner } from '../domain/ports/route-planner';

export type RouteTarget = 'STORE' | 'CUSTOMER';

/**
 * Ruta del domiciliario dentro de la app: desde donde está hasta el local (ACCEPTED) o hasta la puerta del cliente
 * (ON_THE_WAY / ARRIVING). El destino lo pone el servidor con el pedido en curso, así el endpoint no sirve para pedir
 * rutas a cualquier parte. En los demás pasos no hay ruta (está en el local o ya entregó).
 */
@Injectable()
export class TripRouteUseCase {
  constructor(
    private readonly trips: CourierTrips,
    private readonly planner: RoutePlanner,
  ) {}

  async route(principal: Principal, code: string, from: GeoPoint): Promise<{ target: RouteTarget; route: PlannedRoute | null } | null> {
    const trip = await this.trips.active(principal.userId, 'es');
    if (!trip || trip.code !== code) throw FulfillmentErrors.tripNotFound();
    const target: RouteTarget | null =
      trip.status === TRIP_STATUSES.ACCEPTED
        ? 'STORE'
        : (trip.status === TRIP_STATUSES.ON_THE_WAY || trip.status === TRIP_STATUSES.ARRIVING) && trip.destination
          ? 'CUSTOMER'
          : null;
    if (!target) return null;
    const to = target === 'STORE' ? trip.establishment.location : trip.destination!.location;
    return { target, route: await this.planner.plan(from, to) };
  }
}
