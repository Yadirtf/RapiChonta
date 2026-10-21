import { MunicipalityScope } from '../../business-config/application/municipality-scope';
import { Notifier } from '../../notifications/application/notifier';
import { DomainError } from '../../../shared/domain/domain.error';
import { availableCourier, MemoryDispatchBoard, operator, SpySignal } from '../../../../test/dispatch/fakes';
import { OrderNoLongerDispatchable, RecipientRejected } from '../domain/ports/dispatch-board';
import { DispatchBoardUseCase, SendOfferUseCase } from './dispatch-board.use-cases';

const scope = { resolve: async (_p: unknown, requested?: number) => ({ id: requested ?? 1, name: 'Villagarzón', launched: true }) } as unknown as MunicipalityScope;

const setup = () => {
  const board = new MemoryDispatchBoard();
  const signal = new SpySignal();
  const notifier = { kick: jest.fn() };
  return { board, signal, notifier, send: new SendOfferUseCase(board, notifier as unknown as Notifier, signal), read: new DispatchBoardUseCase(board, scope) };
};

const codeOf = async (work: Promise<unknown>) => ((await work.then(() => null, (e: DomainError) => e)) as DomainError | null)?.code;

describe('SendOfferUseCase', () => {
  it('a uno: crea la oferta con quién la envió, avisa ya y despierta el reloj', async () => {
    const { board, send, signal, notifier } = setup();
    const result = await send.execute(operator(), 'rc 7k3m', { mode: 'SPECIFIC', courierUserId: 'beto' });
    expect(board.created).toEqual([{ orderId: 'pedido-1', mode: 'SPECIFIC', sentByUserId: 'operador-1', actingRole: 'OPERATOR', courierUserIds: ['beto'] }]);
    expect(result.recipients).toBe(1);
    expect(notifier.kick).toHaveBeenCalled();
    expect(signal.calls).toBe(1);
  });

  it('a todos: a los disponibles que no lo tienen ni lo rechazaron', async () => {
    const { board, send } = setup();
    board.available = [availableCourier('ana'), availableCourier('beto', { declined: true }), availableCourier('caro')];
    await send.execute(operator(), 'RC-7K3M', { mode: 'BROADCAST' });
    expect(board.created[0].courierUserIds).toEqual(['ana', 'caro']);
    expect(board.couriersAsked[0]).toEqual({ municipalityId: 1, orderId: 'pedido-1' });
  });

  it('un pedido de otro municipio no existe para el operador con alcance', async () => {
    const { send } = setup();
    expect(await codeOf(send.execute(operator(2), 'RC-7K3M', { mode: 'BROADCAST' }))).toBe('ORDER_NOT_FOUND');
    expect(await codeOf(send.execute(operator(), 'RC-XXXX', { mode: 'BROADCAST' }))).toBe('ORDER_NOT_FOUND');
  });

  it('no envía un pedido que ya tiene domiciliario o terminó', async () => {
    const { board, send } = setup();
    board.orders.set('RC-7K3M', { ...board.orders.get('RC-7K3M')!, needsCourier: false });
    expect(await codeOf(send.execute(operator(), 'RC-7K3M', { mode: 'BROADCAST' }))).toBe('ORDER_NOT_DISPATCHABLE');
  });

  it('traduce lo que la base rechaza a mitad del envío', async () => {
    const { board, send } = setup();
    board.createError = new OrderNoLongerDispatchable();
    expect(await codeOf(send.execute(operator(), 'RC-7K3M', { mode: 'BROADCAST' }))).toBe('ORDER_NOT_DISPATCHABLE');
    board.createError = new RecipientRejected();
    expect(await codeOf(send.execute(operator(), 'RC-7K3M', { mode: 'SPECIFIC', courierUserId: 'ana' }))).toBe('COURIER_NOT_AVAILABLE');
  });
});

describe('DispatchBoardUseCase', () => {
  it('los domiciliarios de un pedido se ordenan por su local, solo dentro del municipio', async () => {
    const { board, read } = setup();
    await read.couriers(operator(), { orderCode: 'RC-7K3M' });
    expect(board.couriersAsked).toEqual([{ municipalityId: 1, orderId: 'pedido-1' }]);
    expect(await codeOf(read.couriers(operator(null), { municipalityId: 2, orderCode: 'RC-7K3M' }))).toBe('ORDER_NOT_FOUND');
  });
});
