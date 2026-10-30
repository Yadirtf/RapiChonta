import { Principal } from '../../src/modules/identity/domain/principal';
import {
  CollectionAccount,
  CollectionResult,
  CourierCollections,
  CourierTrips,
  CustomerDeliveries,
  PendingCollection,
  CustomerDeliveryResult,
  DeliveryReviewWatch,
  PreparationWatch,
  Trip,
  TripCommand,
  TripRef,
  TripResult,
} from '../../src/modules/fulfillment/domain/ports/courier-trips';
import { PreparationSignal } from '../../src/modules/fulfillment/application/preparation-signal';
import { CollectionMethod, ResolvedPayment } from '../../src/modules/fulfillment/domain/collection';
import { ReportedLine, SubstituteCandidate } from '../../src/modules/fulfillment/domain/adjustments';
import {
  AdjustmentReader,
  AdjustmentRequestView,
  DecideInput,
  DecideResult,
  OrderAdjustments,
} from '../../src/modules/fulfillment/domain/ports/adjustments';

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
  commands: (TripCommand & { kind: string; amount?: string; receiptFileId?: string; deliveryCode?: string; fileId?: string; lines?: readonly ReportedLine[] })[] = [];
  trip: Trip | null = null;
  result: TripResult = { ok: true };

  async active(): Promise<Trip | null> {
    return this.trip;
  }

  async openAdjustment(command: TripCommand & { lines: readonly ReportedLine[] }) {
    this.commands.push({ ...command, kind: 'adjustment' });
    return this.result;
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

  async pickUp(command: TripCommand) {
    this.commands.push({ ...command, kind: 'pickup' });
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
  calls: { kind: string; customer: string; code: string; description?: string | null }[] = [];

  async confirmReceived(customer: string, code: string) {
    this.calls.push({ kind: 'received', customer, code });
    return this.result;
  }

  async reportNotReceived(customer: string, code: string, description: string | null) {
    this.calls.push({ kind: 'not-received', customer, code, description });
    return this.result;
  }
}

/** H10.2: el domiciliario con efectivo y Nequi (con cuenta); Daviplata existe pero no tiene cuenta. */
export class MemoryCourierCollections extends CourierCollections {
  methodsList: CollectionMethod[] = [
    { code: 'CASH', isAccountBased: false, accountId: null },
    { code: 'NEQUI', isAccountBased: true, accountId: 'cuenta-nequi' },
    { code: 'DAVIPLATA', isAccountBased: true, accountId: null },
  ];
  recorded: { courier: string; code: string; payments: readonly ResolvedPayment[]; at: Date }[] = [];
  result: CollectionResult = { ok: true, replayed: false };
  qr: { accountId: string; fileId: string }[] = [];
  owned = new Set(['cuenta-nequi']);

  async methods() {
    return this.methodsList;
  }
  async accounts(): Promise<CollectionAccount[]> {
    return [...this.owned].map((id) => ({ id, paymentMethod: 'NEQUI', bank: null, accountType: null, accountNumber: '3001234567', holderName: 'Ana', qrFileId: this.qr.find((q) => q.accountId === id)?.fileId ?? null }));
  }
  async setQr(_courier: string, accountId: string, fileId: string) {
    if (!this.owned.has(accountId)) return false;
    this.qr.push({ accountId, fileId });
    return true;
  }
  async record(courier: string, code: string, payments: readonly ResolvedPayment[], at: Date) {
    this.recorded.push({ courier, code, payments, at });
    return this.result;
  }
  async pending(): Promise<PendingCollection[]> {
    return [];
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

/** E09 en memoria: guarda las decisiones que llegan y responde lo que la prueba fije. */
export class MemoryOrderAdjustments extends OrderAdjustments {
  prices = new Map<string, string>([
    ['linea-1', '12000.00'],
    ['linea-2', '3500.00'],
  ]);
  decisions: DecideInput[] = [];
  result: DecideResult = { ok: true, status: 'AWAITING_CUSTOMER', resolved: false };
  menu: { original: { productId: string; menuSectionId: string; unitPrice: string }; inOrder: Set<string>; candidates: SubstituteCandidate[] } | null = null;

  async linePrices() {
    return this.prices;
  }
  async decide(input: DecideInput) {
    this.decisions.push(input);
    return this.result;
  }
  async substitutes() {
    return this.menu;
  }
  async expireDue() {
    return 0;
  }
  async nextDueAt() {
    return null;
  }
}

export class MemoryAdjustmentReader extends AdjustmentReader {
  requests: AdjustmentRequestView[] = [];
  async forOrder() {
    return this.requests;
  }
}
