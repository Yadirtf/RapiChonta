import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { DomainError } from '../../../shared/domain/domain.error';
import { courier, MemoryCourierTrips } from '../../../../test/fulfillment/fakes';
import { Trip } from '../domain/ports/courier-trips';
import { PlannedRoute, RoutePlanner } from '../domain/ports/route-planner';
import { TripRouteUseCase } from './trip-route.use-case';

const store = GeoPoint.create(1.0294, -76.6165);
const door = GeoPoint.create(1.0331, -76.6201);
const here = GeoPoint.create(1.0251, -76.6122);
const ROUTE: PlannedRoute = { line: [[-76.6122, 1.0251], [-76.6165, 1.0294]], distanceMeters: 820, durationSeconds: 140 };

class SpyPlanner extends RoutePlanner {
  calls: { from: GeoPoint; to: GeoPoint }[] = [];
  async plan(from: GeoPoint, to: GeoPoint) {
    this.calls.push({ from, to });
    return ROUTE;
  }
}

function setup(status: string, withDestination = true) {
  const trips = new MemoryCourierTrips();
  trips.trip = {
    orderId: 'pedido-1',
    code: 'RC-7K3M',
    status,
    establishment: { location: store },
    destination: withDestination ? { location: door } : null,
  } as unknown as Trip;
  const planner = new SpyPlanner();
  return { planner, useCase: new TripRouteUseCase(trips, planner) };
}

describe('TripRouteUseCase', () => {
  it('rumbo al local (ACCEPTED): ruta desde donde está hasta el local', async () => {
    const { planner, useCase } = setup('ACCEPTED');
    expect(await useCase.route(courier, 'RC-7K3M', here)).toEqual({ target: 'STORE', route: ROUTE });
    expect(planner.calls).toEqual([{ from: here, to: store }]);
  });

  it.each(['ON_THE_WAY', 'ARRIVING'])('rumbo al cliente (%s): ruta hasta su puerta', async (status) => {
    const { planner, useCase } = setup(status);
    expect(await useCase.route(courier, 'RC-7K3M', here)).toEqual({ target: 'CUSTOMER', route: ROUTE });
    expect(planner.calls[0].to).toBe(door);
  });

  it('en el local o sin dirección revelada no hay ruta ni consulta al servicio', async () => {
    for (const [status, destination] of [['AT_ESTABLISHMENT', true], ['PREPARING', true], ['ON_THE_WAY', false]] as const) {
      const { planner, useCase } = setup(status, destination);
      expect(await useCase.route(courier, 'RC-7K3M', here)).toBeNull();
      expect(planner.calls).toHaveLength(0);
    }
  });

  it('un pedido que no es el suyo en curso es TRIP_NOT_FOUND', async () => {
    const { useCase } = setup('ACCEPTED');
    const error = await useCase.route(courier, 'RC-0000', here).catch((e: DomainError) => e);
    expect((error as DomainError).code).toBe('TRIP_NOT_FOUND');
  });
});
