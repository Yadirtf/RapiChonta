import { Notifier } from '../../notifications/application/notifier';
import { DomainError } from '../../../shared/domain/domain.error';
import {
  courier,
  MemoryAdjustmentReader,
  MemoryCourierCollections,
  MemoryCourierTrips,
  MemoryCustomerDeliveries,
  MemoryOrderAdjustments,
  SpyPreparationSignal,
} from '../../../../test/fulfillment/fakes';
import { GeofenceProbe } from '../domain/ports/courier-trips';
import { CourierCollectionsUseCase, CourierTripUseCase, CustomerAdjustmentsUseCase, CustomerDeliveryUseCase, GeofenceUseCase } from './courier-trip.use-cases';
import { DecideFailure } from '../domain/ports/adjustments';
import { Trip } from '../domain/ports/courier-trips';

const codeOf = async (work: Promise<unknown>) => ((await work.then(() => null, (e: DomainError) => e)) as DomainError | null)?.code;
const now = new Date('2026-10-21T12:10:00Z');
const EVENT = '6f1c9a52-7d0e-4f86-9a51-0c2f3b1d9e10';

function setup() {
  const trips = new MemoryCourierTrips();
  const notifier = { kick: jest.fn() };
  const signal = new SpyPreparationSignal();
  const adjustments = new MemoryOrderAdjustments();
  const reader = new MemoryAdjustmentReader();
  return { trips, notifier, signal, adjustments, reader, useCase: new CourierTripUseCase(trips, notifier as unknown as Notifier, signal, adjustments, reader) };
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

  it('"No lo recibí" lleva lo que cuenta el cliente, limpio y recortado; vacío no se guarda', async () => {
    const deliveries = new MemoryCustomerDeliveries();
    deliveries.result = { ok: true, status: 'DISPUTED', changed: true };
    const useCase = new CustomerDeliveryUseCase(deliveries, { kick: jest.fn() } as unknown as Notifier, new SpyPreparationSignal());
    expect(await useCase.reportNotReceived(customer, 'RC-7K3M', '  Nadie me tocó la puerta  ')).toEqual({ orderCode: 'RC-7K3M', status: 'DISPUTED' });
    await useCase.reportNotReceived(customer, 'RC-7K3M', '   ');
    await useCase.reportNotReceived(customer, 'RC-7K3M', 'x'.repeat(900));
    expect(deliveries.calls.map((c) => c.description?.length ?? null)).toEqual([23, null, 500]);
  });
});

describe('CourierCollectionsUseCase (H10.2)', () => {
  const setupCollections = () => {
    const collections = new MemoryCourierCollections();
    return { collections, useCase: new CourierCollectionsUseCase(collections) };
  };

  it('efectivo + Nequi: cada pago lleva la cuenta solo si el medio es de cuenta (la pone la API, no la app)', async () => {
    const { collections, useCase } = setupCollections();
    const result = await useCase.record(courier, 'RC-7K3M', [{ paymentMethod: 'CASH', amount: '20000' }, { paymentMethod: 'NEQUI', amount: '13500.50' }], { clientEventId: EVENT, queued: false }, now);
    expect(result).toEqual({ orderCode: 'RC-7K3M', replayed: false });
    expect(collections.recorded[0]).toMatchObject({
      courier: 'domiciliario-1',
      at: now,
      payments: [
        { paymentMethod: 'CASH', amount: '20000', collectionAccountId: null },
        { paymentMethod: 'NEQUI', amount: '13500.50', collectionAccountId: 'cuenta-nequi' },
      ],
    });
  });

  it('sin señal toma la hora del teléfono si es coherente', async () => {
    const { collections, useCase } = setupCollections();
    const phone = new Date(now.getTime() - 20 * 60_000);
    await useCase.record(courier, 'RC-7K3M', [{ paymentMethod: 'CASH', amount: '5000' }], { clientEventId: EVENT, queued: true, occurredAt: phone }, now);
    expect(collections.recorded[0].at).toEqual(phone);
  });

  it('rechaza antes de tocar la base: medio sin cuenta, medio repetido, montos inválidos', async () => {
    const { collections, useCase } = setupCollections();
    const problem = async (payments: { paymentMethod: string; amount: string }[]) =>
      ((await useCase.record(courier, 'RC-7K3M', payments, { clientEventId: EVENT, queued: false }, now).catch((e: DomainError) => e)) as DomainError).details?.problem;
    expect(await problem([{ paymentMethod: 'DAVIPLATA', amount: '1000' }])).toBe('NO_ACCOUNT');
    expect(await problem([{ paymentMethod: 'CASH', amount: '1000' }, { paymentMethod: 'CASH', amount: '2000' }])).toBe('REPEATED_METHOD');
    expect(await problem([{ paymentMethod: 'CASH', amount: '0' }])).toBe('AMOUNT');
    expect(await problem([{ paymentMethod: 'BITCOIN', amount: '1000' }])).toBe('METHOD');
    expect(await problem([])).toBe('EMPTY');
    expect(collections.recorded).toHaveLength(0);
  });

  it('pedido que no llevó: 404; aún en el local: COLLECTION_STEP_NOT_ALLOWED; reenvío: replayed', async () => {
    const { collections, useCase } = setupCollections();
    const pay = () => useCase.record(courier, 'RC-7K3M', [{ paymentMethod: 'CASH', amount: '1000' }], { clientEventId: EVENT, queued: false }, now);
    collections.result = { ok: false, reason: 'NOT_FOUND' };
    expect(await codeOf(pay())).toBe('COLLECTION_ORDER_NOT_FOUND');
    collections.result = { ok: false, reason: 'STEP', status: 'PREPARING' };
    expect(await codeOf(pay())).toBe('COLLECTION_STEP_NOT_ALLOWED');
    collections.result = { ok: true, replayed: true };
    expect(await pay()).toEqual({ orderCode: 'RC-7K3M', replayed: true });
  });

  it('el QR solo en una cuenta suya', async () => {
    const { useCase } = setupCollections();
    expect((await useCase.setQr(courier, 'cuenta-nequi', 'qr-1')).qrFileId).toBe('qr-1');
    expect(await codeOf(useCase.setQr(courier, 'cuenta-ajena', 'qr-1'))).toBe('COLLECTION_ACCOUNT_NOT_FOUND');
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

describe('Producto faltante: el domiciliario consulta (H09.2)', () => {
  it('abre una sola consulta con todas las líneas: pasa a AWAITING_CUSTOMER, avisa y despierta el reloj', async () => {
    const { trips, notifier, signal, useCase } = setup();
    const lines = [
      { orderItemId: 'linea-1', reason: 'UNAVAILABLE' as const },
      { orderItemId: 'linea-2', reason: 'PRICE_CHANGED' as const, unitPrice: '4000' },
    ];
    // Aunque la app diga que salió de la cola sin señal, la consulta corre con la hora del servidor.
    const result = await useCase.reportAdjustment(courier, 'RC-7K3M', { clientEventId: EVENT, queued: true, occurredAt: new Date('2026-10-21T12:05:00Z'), lines }, now);
    expect(result).toEqual({ orderCode: 'RC-7K3M', status: 'AWAITING_CUSTOMER', replayed: false });
    expect(trips.commands[0]).toMatchObject({ kind: 'adjustment', lines, occurredAt: now, offline: false });
    expect(notifier.kick).toHaveBeenCalledTimes(1);
    expect(signal.calls).toBe(1);
  });

  it('rechaza antes de tocar la base lo que no es una consulta válida', async () => {
    const { trips, useCase } = setup();
    const report = (lines: { orderItemId: string; reason: 'UNAVAILABLE' | 'PRICE_CHANGED'; unitPrice?: string }[]) =>
      codeOf(useCase.reportAdjustment(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, lines }, now));
    expect(await report([])).toBe('ADJUSTMENT_REPORT_INVALID');
    expect(await report([{ orderItemId: 'linea-2', reason: 'PRICE_CHANGED' }])).toBe('ADJUSTMENT_REPORT_INVALID');
    expect(await report([{ orderItemId: 'linea-2', reason: 'PRICE_CHANGED', unitPrice: '3500' }])).toBe('ADJUSTMENT_REPORT_INVALID');
    expect(await report([{ orderItemId: 'linea-1', reason: 'UNAVAILABLE', unitPrice: '100' }])).toBe('ADJUSTMENT_REPORT_INVALID');
    expect(trips.commands).toHaveLength(0);
  });

  it('solo en el local, y traduce el rechazo de una línea que ya no está', async () => {
    const { trips, useCase } = setup();
    const lines = [{ orderItemId: 'linea-1', reason: 'UNAVAILABLE' as const }];
    trips.result = { ok: false, reason: 'LINES', status: 'AT_ESTABLISHMENT' };
    expect(await codeOf(useCase.reportAdjustment(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, lines }, now))).toBe('ADJUSTMENT_LINES_INVALID');
    trips.current = { ...trips.current!, status: 'PREPARING' };
    expect(await codeOf(useCase.reportAdjustment(courier, 'RC-7K3M', { clientEventId: EVENT, queued: false, lines }, now))).toBe('TRIP_STEP_NOT_ALLOWED');
  });

  it('en el local, el pedido en curso trae la última consulta (cuenta regresiva o decisión)', async () => {
    const { trips, reader, useCase } = setup();
    const request = { id: 'consulta-1', reportedAt: now, expiresAt: new Date(now.getTime() + 180_000), open: true, lines: [] };
    reader.requests = [request];
    trips.trip = { orderId: 'pedido-1', code: 'RC-7K3M', status: 'AWAITING_CUSTOMER' } as Trip;
    expect(await useCase.active(courier, 'es')).toMatchObject({ adjustment: request });
    trips.trip = { orderId: 'pedido-1', code: 'RC-7K3M', status: 'PREPARING' } as Trip;
    expect((await useCase.active(courier, 'es'))?.adjustment).toBeUndefined();
  });
});

describe('Producto faltante: el cliente decide (H09.3)', () => {
  const customer = { ...courier, userId: 'cliente-1', role: 'CUSTOMER' as const };
  function customerSetup() {
    const adjustments = new MemoryOrderAdjustments();
    const notifier = { kick: jest.fn() };
    const signal = new SpyPreparationSignal();
    return { adjustments, notifier, signal, useCase: new CustomerAdjustmentsUseCase(adjustments, notifier as unknown as Notifier, signal) };
  }

  it('con la última decisión el pedido sigue: avisa al domiciliario y despierta el reloj', async () => {
    const { adjustments, notifier, signal, useCase } = customerSetup();
    expect(await useCase.decide(customer, 'RC-7K3M', 'ajuste-1', { decision: 'REMOVE_ITEM' })).toEqual({ orderCode: 'RC-7K3M', status: 'AWAITING_CUSTOMER', resolved: false });
    expect(notifier.kick).not.toHaveBeenCalled();
    adjustments.result = { ok: true, status: 'AT_ESTABLISHMENT', resolved: true };
    await useCase.decide(customer, 'RC-7K3M', 'ajuste-2', { decision: 'SUBSTITUTE', productVersionId: 'version-9' });
    expect(adjustments.decisions[1]).toEqual({ customerUserId: 'cliente-1', orderCode: 'RC-7K3M', adjustmentId: 'ajuste-2', decision: 'SUBSTITUTE', productVersionId: 'version-9' });
    expect(notifier.kick).toHaveBeenCalledTimes(1);
    expect(signal.calls).toBe(1);
  });

  it('traduce cada rechazo a un código que la web y la app entienden', async () => {
    const { adjustments, useCase } = customerSetup();
    const cases: [DecideFailure, string][] = [
      ['NOT_FOUND', 'ORDER_NOT_FOUND'],
      ['STEP', 'ADJUSTMENT_CLOSED'],
      ['DECIDED', 'ADJUSTMENT_CLOSED'],
      ['OPTION', 'ADJUSTMENT_OPTION_INVALID'],
      ['SUBSTITUTE', 'SUBSTITUTE_UNAVAILABLE'],
    ];
    for (const [reason, code] of cases) {
      adjustments.result = { ok: false, reason, status: 'AT_ESTABLISHMENT' };
      expect(await codeOf(useCase.decide(customer, 'RC-7K3M', 'ajuste-1', { decision: 'ACCEPT_PRICE' }))).toBe(code);
    }
  });

  it('las sugerencias salen ordenadas: misma sección y precio parecido primero, sin lo que ya está en el pedido', async () => {
    const { adjustments, useCase } = customerSetup();
    const item = (productId: string, section: string, price: string) => ({ productId, productVersionId: `v-${productId}`, menuSectionId: section, name: productId, price, imageFileId: null });
    adjustments.menu = {
      original: { productId: 'gaseosa', menuSectionId: 'bebidas', unitPrice: '3500.00' },
      inOrder: new Set(['jugo']),
      candidates: [item('gaseosa', 'bebidas', '3500'), item('agua', 'bebidas', '2000'), item('jugo', 'bebidas', '3600'), item('te', 'bebidas', '3800'), item('papas', 'snacks', '3500')],
    };
    expect((await useCase.substitutes(customer, 'RC-7K3M', 'ajuste-1', 'es')).map((c) => c.productId)).toEqual(['te', 'agua', 'papas']);
    adjustments.menu = null;
    expect(await codeOf(useCase.substitutes(customer, 'RC-7K3M', 'ajuste-1', 'es'))).toBe('ADJUSTMENT_CLOSED');
  });
});
