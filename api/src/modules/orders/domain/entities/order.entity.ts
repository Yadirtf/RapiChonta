import { DomainError } from '../../../../shared/domain/domain.error';
import { Entity } from '../../../../shared/domain/entity';
import { canTransition, OrderStatus } from './order-status';

export enum FulfillmentMode {
  /** MVP: el domiciliario compra en nombre del cliente. */
  COURIER_PURCHASE = 'COURIER_PURCHASE',
  /** Fase futura: el comercio aliado recibe el pedido y RapiChonta solo entrega. */
  MERCHANT_DIRECT = 'MERCHANT_DIRECT',
}

export interface OrderItem {
  description: string;
  quantity: number;
  notes?: string;
  estimatedUnitPrice?: number;
}

export interface OrderProps {
  customerId: string;
  establishmentId: string;
  courierId?: string;
  items: OrderItem[];
  status: OrderStatus;
  fulfillmentMode: FulfillmentMode;
  deliveryFee: number;
  /** Total real de la compra, lo confirma el domiciliario con la factura. */
  purchaseTotal?: number;
  createdAt: Date;
}

export class Order extends Entity<OrderProps> {
  static create(id: string, props: Omit<OrderProps, 'status' | 'createdAt'>): Order {
    if (!props.items.length) throw new DomainError('El pedido debe tener al menos un producto');
    return new Order(id, { ...props, status: OrderStatus.PENDING_ASSIGNMENT, createdAt: new Date() });
  }

  get status() { return this.props.status; }
  get courierId() { return this.props.courierId; }

  assignCourier(courierId: string): void {
    this.transitionTo(OrderStatus.ASSIGNED);
    this.props.courierId = courierId;
  }

  confirmPurchase(total: number): void {
    if (total <= 0) throw new DomainError('El total de la compra debe ser mayor a cero');
    this.transitionTo(OrderStatus.PURCHASED);
    this.props.purchaseTotal = total;
  }

  transitionTo(next: OrderStatus): void {
    if (!canTransition(this.props.status, next)) {
      throw new DomainError(`No se puede pasar de ${this.props.status} a ${next}`);
    }
    this.props.status = next;
  }
}
