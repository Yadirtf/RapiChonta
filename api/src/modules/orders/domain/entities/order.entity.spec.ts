import { DomainError } from '../../../../shared/domain/domain.error';
import { FulfillmentMode, Order } from './order.entity';
import { OrderStatus } from './order-status';

const newOrder = () =>
  Order.create('o-1', {
    customerId: 'c-1',
    establishmentId: 'e-1',
    items: [{ description: 'Hamburguesa doble', quantity: 1 }],
    fulfillmentMode: FulfillmentMode.COURIER_PURCHASE,
    deliveryFee: 5000,
  });

describe('Order', () => {
  it('nace pendiente de asignación', () => {
    expect(newOrder().status).toBe(OrderStatus.PENDING_ASSIGNMENT);
  });

  it('permite asignar domiciliario y avanzar a compra', () => {
    const order = newOrder();
    order.assignCourier('k-1');
    order.transitionTo(OrderStatus.PURCHASING);
    order.confirmPurchase(32000);
    expect(order.status).toBe(OrderStatus.PURCHASED);
  });

  it('rechaza saltos de estado inválidos', () => {
    expect(() => newOrder().transitionTo(OrderStatus.DELIVERED)).toThrow(DomainError);
  });
});
