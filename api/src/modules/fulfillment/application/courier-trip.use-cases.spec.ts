import { Notifier } from '../../notifications/application/notifier';
import { DomainError } from '../../../shared/domain/domain.error';
import { courier, MemoryCourierTrips, MemoryCustomerDeliveries, SpyPreparationSignal } from '../../../../test/fulfillment/fakes';
import { GeofenceProbe } from '../domain/ports/courier-trips';
import { CourierTripUseCase, CustomerDeliveryUseCase, GeofenceUseCase } from './courier-trip.use-cases';

const codeOf = async (work: Promise<unknown>) => ((await work.then(() => null, (e: DomainError) => e)) as DomainError | null)?.code;
const now = new Date('2026-10-21T12:10:00Z');
const EVENT = '6f1c9a52-7d0e-4f86-9a51-0c2f3b1d9e10';

function setup() {
  const trips = new MemoryCourierTrips();
  const notifier = { kick: jest.fn() };
  const signal = new SpyPreparationSignal();
  return { trips, notifier, signal, useCase: new CourierTripUseCase(trips, notifier as unknown as Notifier, signal) };
}

describe('CourierTripUseCase', () => {
  it('registra la compra con la factura: pasa a PREPARING, avisa y despierta el reloj de preparación', async () => {
    const { trips, notifier, signal, useCase } = setup();
    const result = await useCase.purchase(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, amount: '23500', receiptFileId: 'factura-1' }, now);
    expect(result).toEqual({ orderCode: 'RC-7K3M', status: 'PREPARING', replayed: false });
    expect(trips.commands[0]).toMatchObject({ kind: 'purchase', amount: '23500', receiptFileId: 'factura-1', occurredAt: now, offline: false });
    expect(notifier.kick).toHaveBeenCalledTimes(1);
    expect(signal.calls).toBe(1);
  });

  it('valida el monto antes de tocar la base', async () => {
    const { trips, useCase } = setup();
    for (const amount of ['0', '-5', '12,5', '1.234', 'abc']) {
      expect(await codeOf(useCase.purchase(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, amount, receiptFileId: 'f' }, now))).toBe('PURCHASE_AMOUNT_INVALID');
    }
    expect(trips.commands).toHaveLength(0);
  });

  it('solo sobre su pedido en curso y en el paso que corresponde', async () => {
    const { trips, useCase } = setup();
    expect(await codeOf(useCase.ready(courier, 'RC-OTRO1', { clientEventId: EVENT, queued: false }, now))).toBe('TRIP_NOT_FOUND');
    expect(await codeOf(useCase.ready(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false }, now))).toBe('TRIP_STEP_NOT_ALLOWED');
    trips.current = { ...trips.current!, status: 'PREPARING' };
    trips.result = { ok: false, reason: 'STEP', status: 'ON_THE_WAY' };
    expect(await codeOf(useCase.ready(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false }, now))).toBe('TRIP_STEP_NOT_ALLOWED');
    trips.current = { ...trips.current!, status: 'AT_ESTABLISHMENT' };
    trips.result = { ok: false, reason: 'RECEIPT', status: 'AT_ESTABLISHMENT' };
    expect(await codeOf(useCase.purchase(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, amount: '1000', receiptFileId: 'ajena' }, now))).toBe('RECEIPT_INVALID');
  });

  it('un reenvío de la cola sin señal se responde como hecho, sin repetirlo', async () => {
    const { trips, notifier, useCase } = setup();
    trips.replays.set(EVENT, 'RC-7K3M');
    expect(await useCase.ready(courier, 'RC-7K3M', { clientEventId: EVENT, queued: true }, now)).toEqual({ orderCode: 'RC-7K3M', status: 'AT_ESTABLISHMENT', replayed: true });
    expect(trips.commands).toHaveLength(0);
    expect(notifier.kick).not.toHaveBeenCalled();
    expect(await codeOf(useCase.ready(courier, 'RC-OTRO1', { clientEventId: EVENT, queued: true }, now))).toBe('CLIENT_EVENT_CONFLICT');
  });

  it('sin señal: usa la hora del teléfono si es coherente y marca el cambio como OFFLINE_SYNC', async () => {
    const { trips, useCase } = setup();
    trips.current = { ...trips.current!, status: 'PREPARING' };
    const claimed = new Date('2026-10-21T12:05:00Z');
    await useCase.delay(courier, 'RC-7K3M', { clientEventId: EVENT, queued: true, occurredAt: claimed }, now);
    expect(trips.commands[0]).toMatchObject({ kind: 'delay', occurredAt: claimed, offline: true });
  });
});

describe('Cierre de la entrega (código, "Llegué" y foto)', () => {
  it('"Llegué" solo en camino; el código vale en camino o llegando y libera al domiciliario', async () => {
    const { trips, notifier, useCase } = setup();
    trips.current = { ...trips.current!, status: 'ON_THE_WAY' };
    expect(await useCase.arrived(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false }, now)).toEqual({ orderCode: 'RC-7K3M', status: 'ARRIVING', replayed: false });
    expect(await useCase.deliver(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, deliveryCode: '0427' }, now)).toMatchObject({ status: 'DELIVERED' });
    expect(trips.commands.map((c) => c.kind)).toEqual(['arrived', 'deliver']);
    expect(notifier.kick).toHaveBeenCalledTimes(2);

    trips.current = { ...trips.current!, status: 'PREPARING' };
    expect(await codeOf(useCase.arrived(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false }, now))).toBe('TRIP_STEP_NOT_ALLOWED');
    expect(await codeOf(useCase.deliver(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, deliveryCode: '0427' }, now))).toBe('TRIP_STEP_NOT_ALLOWED');
    // La foto solo donde el cliente.
    trips.current = { ...trips.current!, status: 'ON_THE_WAY' };
    expect(await codeOf(useCase.proof(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, fileId: 'foto-1' }, now))).toBe('TRIP_STEP_NOT_ALLOWED');
  });

  it('traduce los rechazos del código y de la foto', async () => {
    const { trips, notifier, useCase } = setup();
    trips.current = { ...trips.current!, status: 'ARRIVING' };
    const deliver = () => useCase.deliver(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, deliveryCode: '1111' }, now);
    const proof = () => useCase.proof(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, fileId: 'foto-1' }, now);

    trips.result = { ok: false, reason: 'CODE', status: 'ARRIVING', attemptsLeft: 3 };
    const wrong = (await deliver().catch((e: DomainError) => e)) as DomainError;
    expect(wrong.code).toBe('DELIVERY_CODE_WRONG');
    expect(wrong.details).toEqual({ attemptsLeft: 3 });
    trips.result = { ok: false, reason: 'CODE_LOCKED', status: 'ARRIVING' };
    expect(await codeOf(deliver())).toBe('DELIVERY_CODE_LOCKED');

    const availableAt = new Date('2026-10-21T12:15:00Z');
    trips.result = { ok: false, reason: 'PROOF_EARLY', status: 'ARRIVING', availableAt };
    const early = (await proof().catch((e: DomainError) => e)) as DomainError;
    expect(early.code).toBe('DELIVERY_PROOF_TOO_EARLY');
    expect(early.details).toEqual({ availableAt: availableAt.toISOString() });
    trips.result = { ok: false, reason: 'PROOF', status: 'ARRIVING' };
    expect(await codeOf(proof())).toBe('DELIVERY_PROOF_INVALID');
    expect(notifier.kick).not.toHaveBeenCalled();

    trips.result = { ok: true };
    expect(await proof()).toMatchObject({ status: 'PENDING_REVIEW' });
    expect(trips.commands.at(-1)).toMatchObject({ kind: 'proof', fileId: 'foto-1' });
  });
});

describe('CustomerDeliveryUseCase', () => {
  const customer = { ...courier, userId: 'cliente-1', role: 'CUSTOMER' as const, permissions: new Set(['orders.confirm_delivery']) };

  it('"Recibí mi pedido" avisa y despierta el reloj; repetirlo no hace nada nuevo', async () => {
    const deliveries = new MemoryCustomerDeliveries();
    const notifier = { kick: jest.fn() };
    const signal = new SpyPreparationSignal();
    const useCase = new CustomerDeliveryUseCase(deliveries, notifier as unknown as Notifier, signal);
    expect(await useCase.confirmReceived(customer, 'RC-7K3M')).toEqual({ orderCode: 'RC-7K3M', status: 'DELIVERED' });
    expect(deliveries.calls[0]).toEqual({ kind: 'received', customer: 'cliente-1', code: 'RC-7K3M' });
    expect(notifier.kick).toHaveBeenCalledTimes(1);
    expect(signal.calls).toBe(1);

    deliveries.result = { ok: true, status: 'DELIVERED', changed: false };
    await useCase.confirmReceived(customer, 'RC-7K3M');
    expect(notifier.kick).toHaveBeenCalledTimes(1);
  });

  it('pedido ajeno: 404; paso equivocado: DELIVERY_STEP_NOT_ALLOWED', async () => {
    const deliveries = new MemoryCustomerDeliveries();
    const useCase = new CustomerDeliveryUseCase(deliveries, { kick: jest.fn() } as unknown as Notifier, new SpyPreparationSignal());
    deliveries.result = { ok: false, reason: 'NOT_FOUND' };
    expect(await codeOf(useCase.reportNotReceived(customer, 'RC-7K3M'))).toBe('ORDER_NOT_FOUND');
    deliveries.result = { ok: false, reason: 'STEP', status: 'PREPARING' };
    expect(await codeOf(useCase.reportNotReceived(customer, 'RC-7K3M'))).toBe('DELIVERY_STEP_NOT_ALLOWED');
  });
});

describe('GeofenceUseCase', () => {
  it('si llegó, el aviso al cliente sale de inmediato', async () => {
    const notifier = { kick: jest.fn() };
    const probe = { evaluate: jest.fn().mockResolvedValueOnce({ orderCode: 'RC-7K3M', status: 'ARRIVING' }).mockResolvedValueOnce(null) };
    const useCase = new GeofenceUseCase(probe as unknown as GeofenceProbe, notifier as unknown as Notifier);
    expect(await useCase.evaluate('d-1')).toEqual({ orderCode: 'RC-7K3M', status: 'ARRIVING' });
    expect(await useCase.evaluate('d-1')).toBeNull();
    expect(notifier.kick).toHaveBeenCalledTimes(1);
  });
});
