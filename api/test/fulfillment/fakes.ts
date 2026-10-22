import { Principal } from '../../src/modules/identity/domain/principal';
import {
  CourierTrips,
  CustomerDeliveries,
  CustomerDeliveryResult,
  DeliveryReviewWatch,
  PreparationWatch,
  Trip,
  TripCommand,
  TripRef,
  TripResult,
} from '../../src/modules/fulfillment/domain/ports/courier-trips';
import { PreparationSignal } from '../../src/modules/fulfillment/application/preparation-signal';

export const courier: Principal = {
  userId: 'domiciliario-1',
  sessionId: 'sesion-1',
  role: 'COURIER',
  permissions: new Set(['orders.progress']),
  municipalityId: null,
};

export class MemoryCourierTrips extends CourierTrips {
  current: TripRef | null = { orderId: 'pedido-1', code: 'RC-7K3M', status: 'AT_ESTABLISHMENT', lastChangeAt: new Date('2026-10-21T12:00:00Z') };
  replays = new Map<string, string>();
  commands: (TripCommand & { kind: string; amount?: string; receiptFileId?: string; deliveryCode?: string; fileId?: string })[] = [];
  result: TripResult = { ok: true };

  async active(): Promise<Trip | null> {
    return null;
  }

  async ref(_courier: string, code: string) {
    return this.current && this.current.code === code ? this.current : null;
  }

  async replayedOrderCode(clientEventId: string) {
    return this.replays.get(clientEventId) ?? null;
  }

  async registerPurchase(command: TripCommand & { amount: string; receiptFileId: string }) {
    this.commands.push({ ...command, kind: 'purchase' });
    return this.result;
  }

  async markReady(command: TripCommand) {
    this.commands.push({ ...command, kind: 'ready' });
    return this.result;
  }

  async reportDelay(command: TripCommand) {
    this.commands.push({ ...command, kind: 'delay' });
    return this.result;
  }

  async markArrived(command: TripCommand) {
    this.commands.push({ ...command, kind: 'arrived' });
    return this.result;
  }

  async deliverWithCode(command: TripCommand & { deliveryCode: string }) {
    this.commands.push({ ...command, kind: 'deliver' });
    return this.result;
  }

  async deliverWithProof(command: TripCommand & { fileId: string }) {
    this.commands.push({ ...command, kind: 'proof' });
    return this.result;
  }
}

export class MemoryCustomerDeliveries extends CustomerDeliveries {
  result: CustomerDeliveryResult = { ok: true, status: 'DELIVERED', changed: true };
  calls: { kind: string; customer: string; code: string }[] = [];

  async confirmReceived(customer: string, code: string) {
    this.calls.push({ kind: 'received', customer, code });
    return this.result;
  }

  async reportNotReceived(customer: string, code: string) {
    this.calls.push({ kind: 'not-received', customer, code });
    return this.result;
  }
}

export class FakeDeliveryReviewWatch extends DeliveryReviewWatch {
  closed = 0;
  next: Date | null = null;
  runs = 0;
  async closeDue() {
    this.runs++;
    return this.closed;
  }
  async nextDueAt() {
    return this.next;
  }
}

export class SpyPreparationSignal extends PreparationSignal {
  calls = 0;
  reschedule() {
    this.calls++;
  }
}

export class FakePreparationWatch extends PreparationWatch {
  queued = 0;
  next: Date | null = null;
  runs = 0;
  async notifyDue() {
    this.runs++;
    return this.queued;
  }
  async nextCheckAt() {
    return this.next;
  }
}
