import { randomUUID } from 'node:crypto';
import { admin, MemoryMunicipalities, MemorySchedule } from '../../../../test/business/fakes';
import { customer, MemoryAddressBook, MemoryCheckoutReader, MemoryOrders, MemoryRecipientBook, version, VILLAGARZON } from '../../../../test/orders/fakes';
import { MunicipalityScope } from '../../business-config/application/municipality-scope';
import { EnsureOpenForOrders, ManageScheduleUseCase, OpeningHours } from '../../business-config/application/schedule.use-cases';
import { QuoteDeliveryUseCase } from '../../business-config/application/zones.use-cases';
import { BusinessErrors } from '../../business-config/domain/business-config.errors';
import { OrderCode } from '../domain/value-objects/order-code';
import { CheckoutBuilder, CreateOrderInput, CreateOrderUseCase, QuoteOrderUseCase } from './checkout.use-cases';

/** Lunes 19 de octubre de 2026, 10:00 en Villagarzón (UTC-5). */
const MONDAY_10AM = new Date('2026-10-19T15:00:00Z');
const MONDAY_11PM = new Date('2026-10-20T04:00:00Z');

async function setup() {
  const reader = new MemoryCheckoutReader();
  reader.menu = [version('hamburguesa', '18000'), version('gaseosa', '4500')];
  const addresses = new MemoryAddressBook();
  const recipients = new MemoryRecipientBook();
  const orders = new MemoryOrders();
  const zones = { execute: jest.fn().mockResolvedValue({ deliveryZoneFeeId: 'tarifa-centro', fee: '3000.00', zone: { id: 'z-1', name: 'Centro', kind: 'URBAN' } }) };
  const schedule = new MemorySchedule();
  const scope = new MunicipalityScope(new MemoryMunicipalities());
  const hours = new OpeningHours(schedule);
  await new ManageScheduleUseCase(schedule, scope, hours).setWeekly(admin, undefined, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, slots: [{ opensAt: '08:00', closesAt: '22:00' }] })));
  const builder = new CheckoutBuilder(reader, addresses, zones as unknown as QuoteDeliveryUseCase);
  return {
    reader,
    addresses,
    recipients,
    orders,
    zones,
    quote: new QuoteOrderUseCase(builder),
    create: new CreateOrderUseCase(builder, reader, orders, recipients, new EnsureOpenForOrders(scope, hours)),
  };
}

const input = (overrides: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  establishmentId: 'local-1',
  items: [
    { productVersionId: 'hamburguesa', quantity: 2, notes: 'Sin cebolla' },
    { productVersionId: 'gaseosa', quantity: 1 },
  ],
  delivery: { latitude: VILLAGARZON.latitude, longitude: VILLAGARZON.longitude, reference: 'Casa azul, segundo piso' },
  paymentMethod: 'NEQUI',
  clientRequestId: randomUUID(),
  ...overrides,
});

describe('CreateOrder (H04.3)', () => {
  it('crea el pedido con la tarifa de la zona, la comisión vigente y las versiones del menú', async () => {
    const { create, orders, zones } = await setup();
    const result = await create.execute(customer, input({ notes: '  Timbre   dañado ' }), MONDAY_10AM);
    expect(result.code).toMatch(/^RC-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(orders.created).toHaveLength(1);
    expect(orders.created[0]).toMatchObject({
      code: result.code,
      customerUserId: customer.userId,
      deliveryZoneFeeId: 'tarifa-centro',
      commissionRateId: 'comision-1',
      paymentMethod: 'NEQUI',
      customerNotes: 'Timbre dañado',
      recipient: null,
      address: { label: null, reference: 'Casa azul, segundo piso' },
      lines: [
        { productVersionId: 'hamburguesa', quantity: 2, notes: 'Sin cebolla' },
        { productVersionId: 'gaseosa', quantity: 1, notes: null },
      ],
    });
    expect(zones.execute).toHaveBeenCalledWith({ establishmentId: 'local-1', latitude: VILLAGARZON.latitude, longitude: VILLAGARZON.longitude });
  });

  it('no deja confirmar fuera de horario e informa la próxima apertura', async () => {
    const { create, orders } = await setup();
    await expect(create.execute(customer, input(), MONDAY_11PM)).rejects.toMatchObject({
      code: 'OUTSIDE_OPERATING_HOURS',
      details: { nextOpeningAt: '2026-10-20T13:00:00.000Z' },
    });
    expect(orders.created).toHaveLength(0);
  });

  it('aplica el tope de cliente nuevo de 100.000 COP a los productos', async () => {
    const { create, reader } = await setup();
    await expect(create.execute(customer, input({ items: [{ productVersionId: 'hamburguesa', quantity: 6 }] }), MONDAY_10AM)).rejects.toMatchObject({
      code: 'NEW_CUSTOMER_LIMIT',
      details: { limit: '100000.00', available: '100000.00' },
    });
    reader.exposureValue = { deliveredOrders: 1, activeItemsCents: 0 };
    await expect(create.execute(customer, input({ items: [{ productVersionId: 'hamburguesa', quantity: 6 }] }), MONDAY_10AM)).resolves.toMatchObject({ replayed: false });
  });

  it('no se confirma con productos no disponibles ni con un local cerrado temporalmente', async () => {
    const { create, reader } = await setup();
    reader.menu[1] = version('gaseosa', '4500', { orderable: false });
    await expect(create.execute(customer, input(), MONDAY_10AM)).rejects.toMatchObject({ code: 'PRODUCTS_UNAVAILABLE', details: { productIds: ['p-gaseosa'] } });
    reader.establishments.set('local-1', { ...reader.establishments.get('local-1')!, acceptsOrders: false });
    await expect(create.execute(customer, input(), MONDAY_10AM)).rejects.toMatchObject({ code: 'ESTABLISHMENT_NOT_ACCEPTING_ORDERS' });
  });

  it('rechaza un punto fuera de cobertura, sin referencia, o un medio de pago que no existe', async () => {
    const { create, zones } = await setup();
    await expect(create.execute(customer, input({ delivery: { latitude: 1.03, longitude: -76.6, reference: ' ' } }), MONDAY_10AM)).rejects.toMatchObject({ code: 'TEXT_REQUIRED' });
    await expect(create.execute(customer, input({ paymentMethod: 'BITCOIN' }), MONDAY_10AM)).rejects.toMatchObject({ code: 'PAYMENT_METHOD_UNAVAILABLE' });
    zones.execute.mockRejectedValueOnce(BusinessErrors.noCoverage());
    await expect(create.execute(customer, input(), MONDAY_10AM)).rejects.toMatchObject({ code: 'NO_COVERAGE' });
  });

  it('sin comisión configurada el municipio aún no recibe pedidos', async () => {
    const { create, reader } = await setup();
    reader.commission = null;
    await expect(create.execute(customer, input(), MONDAY_10AM)).rejects.toMatchObject({ code: 'ORDERS_NOT_CONFIGURED' });
  });

  it('repetir la confirmación (doble toque, reintento) devuelve el mismo pedido', async () => {
    const { create, orders } = await setup();
    const request = input();
    const first = await create.execute(customer, request, MONDAY_10AM);
    const second = await create.execute(customer, request, MONDAY_10AM);
    expect(second).toEqual({ code: first.code, replayed: true });
    expect(orders.created).toHaveLength(1);
    await expect(create.execute({ ...customer, userId: 'otro' }, request, MONDAY_10AM)).rejects.toMatchObject({ code: 'REQUEST_REUSED' });
  });

  it('si el código ya existe, reintenta con otro', async () => {
    const { create, orders } = await setup();
    const codes = ['RC-AAAA', 'RC-BBBB'];
    orders.taken.add('RC-AAAA');
    const generate = jest.spyOn(OrderCode, 'generate').mockImplementation(() => codes.shift()!);
    await expect(create.execute(customer, input(), MONDAY_10AM)).resolves.toEqual({ code: 'RC-BBBB', replayed: false });
    expect(generate).toHaveBeenNthCalledWith(2, 1);
    generate.mockRestore();
  });

  it('pedido para otra persona: valida el teléfono y usa solo destinatarios propios', async () => {
    const { create, orders, recipients } = await setup();
    await create.execute(customer, input({ recipient: { fullName: '  Doña   Rosa ', phone: '310 555 1234' } }), MONDAY_10AM);
    expect(orders.created[0].recipient).toEqual({ fullName: 'Doña Rosa', phoneE164: '+573105551234' });
    await expect(create.execute(customer, input({ recipient: { fullName: 'Rosa', phone: '123' } }), MONDAY_10AM)).rejects.toMatchObject({ code: 'INVALID_PHONE' });
    recipients.rows.push({ id: 'r-1', owner: 'otro', fullName: 'Ajeno', phoneE164: '+573000000000', createdAt: new Date(), archived: false });
    await expect(create.execute(customer, input({ recipient: { recipientId: 'r-1' } }), MONDAY_10AM)).rejects.toMatchObject({ code: 'RECIPIENT_NOT_FOUND' });
  });

  it('entrega en una dirección guardada del cliente, nunca en la de otro', async () => {
    const { create, addresses, orders } = await setup();
    const casa = await addresses.create(customer.userId, { label: 'Casa', line: null, reference: 'Portón verde', location: VILLAGARZON });
    const ajena = await addresses.create('otro', { label: 'Casa', line: null, reference: 'Otra', location: VILLAGARZON });
    await create.execute(customer, input({ delivery: { addressId: casa.id } }), MONDAY_10AM);
    expect(orders.created[0].address).toEqual({ id: casa.id });
    await expect(create.execute(customer, input({ delivery: { addressId: ajena.id } }), MONDAY_10AM)).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
  });
});

describe('QuoteOrder (H04.1)', () => {
  it('devuelve el total con la tarifa y lo que le queda al cliente nuevo, aunque esté cerrado', async () => {
    const { quote } = await setup();
    const result = await quote.execute(customer, input());
    expect(result.checkout.itemsCents).toBe(4_050_000);
    expect(result.checkout.totalCents).toBe(4_350_000);
    expect(result.delivery.zone.name).toBe('Centro');
    expect(result.checkout.limit).toEqual({ limitCents: 10_000_000, availableCents: 10_000_000 });
  });
});
