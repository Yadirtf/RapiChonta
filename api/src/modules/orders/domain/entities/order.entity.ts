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
  /** Producto del menú administrado por RapiChonta: en el MVP no se pide fuera del catálogo. */
  productId: string;
  quantity: number;
  unitPrice: number;
  prepMinutes: number;
  notes?: string;
}

export interface OrderProps {
  customerId: string;
  establishmentId: string;
  courierId?: string;
  items: OrderItem[];
  status: OrderStatus;
  fulfillmentMode: FulfillmentMode;
  deliveryFee: number;
  /** Total real pagado en el local; puede diferir del menú si hubo cambios aceptados por el cliente. */
  purchaseTotal?: number;
  /** El tiempo de preparación se cumplió y el domiciliario reportó que el local aún no termina. */
  prepDelayed: boolean;
  createdAt: Date;
}

export class Order extends Entity<OrderProps> {
  static create(id: string, props: Omit<OrderProps, 'status' | 'createdAt' | 'prepDelayed'>): Order {
    if (!props.items.length) throw new DomainError('El pedido debe tener al menos un producto');
    return new Order(id, { ...props, status: OrderStatus.PENDING_ASSIGNMENT, prepDelayed: false, createdAt: new Date() });
  }

  get status() { return this.props.status; }
  get courierId() { return this.props.courierId; }
  get prepDelayed() { return this.props.prepDelayed; }

  get itemsTotal(): number {
    return this.props.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  }

  /** Tiempo estimado de preparación: el del producto que más tarda. */
  get estimatedPrepMinutes(): number {
    return Math.max(...this.props.items.map((i) => i.prepMinutes));
  }

  offerTo(courierId: string): void {
    this.transitionTo(OrderStatus.OFFERED);
    this.props.courierId = courierId;
  }

  /** El domiciliario rechazó o no respondió a tiempo: el pedido vuelve a buscar domiciliario. */
  releaseOffer(): void {
    this.transitionTo(OrderStatus.PENDING_ASSIGNMENT);
    this.props.courierId = undefined;
  }

  accept(courierId: string): void {
    if (this.props.courierId !== courierId) throw new DomainError('El pedido no fue ofrecido a este domiciliario');
    this.transitionTo(OrderStatus.ACCEPTED);
  }

  confirmPurchase(total: number): void {
    if (total <= 0) throw new DomainError('El total de la compra debe ser mayor a cero');
    this.transitionTo(OrderStatus.PREPARING);
    this.props.purchaseTotal = total;
  }

  markPrepDelayed(): void {
    if (this.props.status !== OrderStatus.PREPARING) throw new DomainError('El pedido no está en preparación');
    this.props.prepDelayed = true;
  }

  transitionTo(next: OrderStatus): void {
    if (!canTransition(this.props.status, next)) {
      throw new DomainError(`No se puede pasar de ${this.props.status} a ${next}`);
    }
    this.props.status = next;
  }
}
