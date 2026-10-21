import { Notifier } from '../../notifications/application/notifier';
import { DomainError } from '../../../shared/domain/domain.error';
import { courier, MemoryCourierTrips, SpyPreparationSignal } from '../../../../test/fulfillment/fakes';
import { GeofenceProbe } from '../domain/ports/courier-trips';
import { CourierTripUseCase, GeofenceUseCase } from './courier-trip.use-cases';

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
