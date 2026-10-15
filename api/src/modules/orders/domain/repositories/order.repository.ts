import { Order } from '../entities/order.entity';

export abstract class OrderRepository {
  abstract findById(id: string): Promise<Order | null>;
  abstract save(order: Order): Promise<void>;
}
