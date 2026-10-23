import { customer, MemoryAddressBook, MemoryOrders, VILLAGARZON } from '../../../../test/orders/fakes';
import { OrderSummary } from '../domain/ports/orders.repository';
import { ManageAddressesUseCase, MAX_SAVED_ADDRESSES } from './address-book.use-cases';
import { GetMyOrderUseCase, ListMyOrdersUseCase } from './my-orders.use-cases';

const summary = (code: string, day: number, terminal: boolean, owner = customer.userId): OrderSummary & { customer: string } => ({
  code,
  customer: owner,
  establishment: { id: 'local-1', name: 'Asadero', logoFileId: null },
  createdAt: new Date(Date.UTC(2026, 9, day)),
  status: { code: terminal ? 'DELIVERED' : 'PENDING_ASSIGNMENT', at: new Date(Date.UTC(2026, 9, day)), terminal },
  itemCount: 1,
  total: '10000.00',
});

describe('Mis pedidos (H04.4)', () => {
  it('muestra primero los activos y pagina el historial sin mezclar pedidos de otros', async () => {
    const orders = new MemoryOrders();
    orders.summaries = [summary('RC-0001', 1, true), summary('RC-0002', 2, true), summary('RC-0003', 3, true), summary('RC-0004', 4, false), summary('RC-9999', 5, false, 'otro')];
    const list = new ListMyOrdersUseCase(orders);
    const first = await list.execute(customer, { limit: 2 });
    expect(first.active.map((o) => o.code)).toEqual(['RC-0004']);
    expect(first.past.map((o) => o.code)).toEqual(['RC-0003', 'RC-0002']);
    const second = await list.execute(customer, { before: new Date(first.nextBefore!), limit: 2 });
    expect(second).toMatchObject({ active: [], nextBefore: null });
    expect(second.past.map((o) => o.code)).toEqual(['RC-0001']);
  });

  it('el detalle se busca por código normalizado y solo entre los pedidos del cliente', async () => {
    const orders = new MemoryOrders();
    orders.details.set('RC-7K3M', { ...summary('RC-7K3M', 1, false), customer: customer.userId } as never);
    const get = new GetMyOrderUseCase(orders);
    await expect(get.execute(customer, 'rc 7k3m')).resolves.toMatchObject({ code: 'RC-7K3M' });
    await expect(get.execute({ ...customer, userId: 'otro' }, 'RC-7K3M')).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    await expect(get.execute(customer, 'nada')).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
});

describe('Direcciones guardadas (H04.2)', () => {
  it('la primera queda predeterminada y guardar con el mismo nombre la reemplaza', async () => {
    const book = new MemoryAddressBook();
    const manage = new ManageAddressesUseCase(book);
    const casa = await manage.create(customer, { label: 'Casa', reference: 'Portón verde', latitude: VILLAGARZON.latitude, longitude: VILLAGARZON.longitude });
    expect(casa.isDefault).toBe(true);
    const mudanza = await manage.create(customer, { label: ' casa ', reference: 'Frente al parque', latitude: 1.03, longitude: -76.62 });
    const list = await manage.list(customer);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: mudanza.id, isDefault: true, reference: 'Frente al parque' });
  });

  it('exige nombre y referencia y limita cuántas se guardan', async () => {
    const manage = new ManageAddressesUseCase(new MemoryAddressBook());
    const point = { latitude: 1.03, longitude: -76.62 };
    await expect(manage.create(customer, { label: ' ', reference: 'Casa azul', ...point })).rejects.toMatchObject({ details: { field: 'label' } });
    await expect(manage.create(customer, { label: 'Finca', reference: 'x', ...point })).rejects.toMatchObject({ details: { field: 'reference' } });
    for (let i = 0; i < MAX_SAVED_ADDRESSES; i++) await manage.create(customer, { label: `Lugar ${i}`, reference: 'Referencia', ...point });
    await expect(manage.create(customer, { label: 'Una más', reference: 'Referencia', ...point })).rejects.toMatchObject({ code: 'TOO_MANY_ADDRESSES' });
    await expect(manage.archive(customer, 'no-existe')).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
  });

  it('ofrece la dirección del último pedido mientras siga vigente', async () => {
    const book = new MemoryAddressBook();
    const manage = new ManageAddressesUseCase(book);
    await expect(manage.lastUsed(customer)).resolves.toBeNull();
    const casa = await manage.create(customer, { label: 'Casa', reference: 'Portón verde', latitude: 1.03, longitude: -76.62 });
    const finca = await manage.create(customer, { label: 'Finca', reference: 'Después del puente', latitude: 1.04, longitude: -76.63 });
    book.used.push(casa.id, finca.id);
    await expect(manage.lastUsed(customer)).resolves.toMatchObject({ id: finca.id });
    await manage.archive(customer, finca.id);
    await expect(manage.lastUsed(customer)).resolves.toMatchObject({ id: casa.id });
    await expect(manage.lastUsed({ ...customer, userId: 'otro' })).resolves.toBeNull();
  });
});

