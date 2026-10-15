import { DomainError } from '../../../../shared/domain/domain.error';
import { FulfillmentMode, Order } from './order.entity';
import { OrderStatus } from './order-status';

const newOrder = () =>
  Order.create('o-1', {
    customerId: 'c-1',
    establishmentId: 'e-1',
    items: [
      { productId: 'p-1', quantity: 2, unitPrice: 12000, prepMinutes: 15 },
      { productId: 'p-2', quantity: 1, unitPrice: 4000, prepMinutes: 5 },
    ],
    fulfillmentMode: FulfillmentMode.COURIER_PURCHASE,
    deliveryFee: 5000,
  });

describe('Order', () => {
  it('nace buscando domiciliario y calcula total y tiempo de preparación', () => {
    const order = newOrder();
    expect(order.status).toBe(OrderStatus.PENDING_ASSIGNMENT);
    expect(order.itemsTotal).toBe(28000);
    expect(order.estimatedPrepMinutes).toBe(15);
  });

  it('recorre el flujo completo hasta que el cliente confirma la entrega', () => {
    const order = newOrder();
    order.offerTo('k-1');
    order.accept('k-1');
    order.transitionTo(OrderStatus.AT_ESTABLISHMENT);
    order.confirmPurchase(28000);
    order.markPrepDelayed();
    order.transitionTo(OrderStatus.ON_THE_WAY);
    order.transitionTo(OrderStatus.ARRIVING);
    order.transitionTo(OrderStatus.DELIVERED);
    expect(order.status).toBe(OrderStatus.DELIVERED);
    expect(order.prepDelayed).toBe(true);
  });

  it('vuelve a buscar domiciliario si el ofrecido rechaza', () => {
    const order = newOrder();
    order.offerTo('k-1');
    order.releaseOffer();
    expect(order.status).toBe(OrderStatus.PENDING_ASSIGNMENT);
    expect(order.courierId).toBeUndefined();
  });

  it('no deja aceptar a un domiciliario al que no se le ofreció', () => {
    const order = newOrder();
    order.offerTo('k-1');
    expect(() => order.accept('k-2')).toThrow(DomainError);
  });

  it('rechaza saltos de estado inválidos', () => {
    expect(() => newOrder().transitionTo(OrderStatus.DELIVERED)).toThrow(DomainError);
  });
});
