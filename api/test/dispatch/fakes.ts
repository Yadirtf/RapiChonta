import { GeoPoint } from '../../src/modules/catalog/domain/value-objects/geo-point';
import { Principal } from '../../src/modules/identity/domain/principal';
import { DispatchSignal } from '../../src/modules/dispatch/application/dispatch-signal';
import { CourierDesk, CourierOffer, CourierStatus, LocationReading, ResponseResult } from '../../src/modules/dispatch/domain/ports/courier-desk';
import { AvailableCourier, BoardOrder, DispatchBoard, DispatchTarget, NewOffer } from '../../src/modules/dispatch/domain/ports/dispatch-board';
import { StaffActivityEntry, StaffActivityQuery, StaffActivityReader } from '../../src/modules/dispatch/domain/ports/staff-activity';

/** Dobles en memoria de los puertos del despacho: los casos de uso se prueban sin base de datos. */

export const operator = (municipalityId: number | null = 1): Principal => ({
  userId: 'operador-1',
  sessionId: 's-op',
  role: 'OPERATOR',
  permissions: new Set(['orders.read_all', 'orders.assign', 'couriers.read_location']),
  municipalityId,
});

export const courierPrincipal: Principal = {
  userId: 'domi-1',
  sessionId: 's-domi',
  role: 'COURIER',
  permissions: new Set(['offers.respond', 'location.report']),
  municipalityId: 1,
};

export const availableCourier = (userId: string, extra: Partial<AvailableCourier> = {}): AvailableCourier => ({
  userId,
  name: { givenNames: userId, familyNames: null },
  phoneE164: null,
  vehicle: null,
  location: GeoPoint.create(1.03, -76.61),
  accuracyM: 10,
  lastSeenAt: new Date(),
  availableSince: new Date(),
  distanceMeters: 300,
  hasPendingOffer: false,
  declined: false,
  ...extra,
});

export class MemoryDispatchBoard extends DispatchBoard {
  orders = new Map<string, DispatchTarget>([['RC-7K3M', { id: 'pedido-1', municipalityId: 1, establishmentId: 'local-1', needsCourier: true }]]);
  available: AvailableCourier[] = [availableCourier('ana'), availableCourier('beto')];
  created: NewOffer[] = [];
  createError: Error | null = null;
  couriersAsked: { municipalityId: number; orderId?: string }[] = [];

  async activeOrders(): Promise<BoardOrder[]> {
    return [];
  }

  async findOrder(code: string) {
    return this.orders.get(code) ?? null;
  }

  async couriers(municipalityId: number, _fresh: number, orderId?: string) {
    this.couriersAsked.push({ municipalityId, orderId });
    return this.available;
  }

  async createOffer(offer: NewOffer) {
    if (this.createError) throw this.createError;
    this.created.push(offer);
    return { offerId: 'oferta-1', expiresAt: new Date('2026-10-21T12:01:00Z') };
  }
}

export class MemoryCourierDesk extends CourierDesk {
  current: CourierStatus | null = { verified: true, locationConsentPending: false, availableSince: null, activeOrder: null };
  expecting = true;
  recorded: LocationReading[] = [];
  closedWith: string | null = null;
  result: ResponseResult = { ok: true, orderId: 'pedido-1', orderCode: 'RC-7K3M', returnedToPanel: false };

  async status() {
    return this.current;
  }

  async openAvailability() {
    if (this.current) this.current = { ...this.current, availableSince: new Date() };
  }

  async closeAvailability(_courier: string, reason: string) {
    this.closedWith = reason;
    if (this.current) this.current = { ...this.current, availableSince: null };
  }

  async expectsLocation() {
    return this.expecting;
  }

  async recordLocations(_courier: string, readings: LocationReading[]) {
    this.recorded.push(...readings);
  }

  last: LocationReading | null = null;

  async lastReading() {
    return this.last;
  }

  async pendingOffers(): Promise<CourierOffer[]> {
    return [];
  }

  async accept() {
    return this.result;
  }

  async reject() {
    return this.result;
  }
}

export class SpySignal extends DispatchSignal {
  calls = 0;
  reschedule() {
    this.calls++;
  }
}

export class MemoryStaffActivity extends StaffActivityReader {
  queries: StaffActivityQuery[] = [];
  rows: StaffActivityEntry[] = [];

  async list(query: StaffActivityQuery) {
    this.queries.push(query);
    return this.rows.slice(0, query.limit);
  }

  async actors() {
    return [];
  }
}

export const activity = (id: string, at: string): StaffActivityEntry => ({
  id,
  occurredAt: new Date(at),
  actor: { userId: 'operador-1', givenNames: 'Ana', familyNames: null, role: 'OPERATOR' },
  action: 'ORDER_OFFERED',
  entityTable: 'order_offers',
  entityId: id,
  orderCode: 'RC-7K3M',
  details: null,
});
