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
  /** Domiciliarios notificados en la oferta actual (uno elegido por el operador, o todos los disponibles). */
  offeredTo: string[];
  courierId?: string;
  items: OrderItem[];
  status: OrderStatus;
  fulfillmentMode: FulfillmentMode;
  /** Tarifa de la zona de entrega (barrio urbano o vereda), configurada en el panel. */
  deliveryFee: number;
  /** Porcentaje del domicilio que el domiciliario paga a RapiChonta, copiado al crear el pedido (0.15 = 15 %). */
  commissionRate: number;
  /** Total real pagado en el local; puede diferir del menú si hubo cambios aceptados por el cliente. */
  purchaseTotal?: number;
  /** El tiempo de preparación se cumplió y el domiciliario reportó que el local aún no termina. */
  prepDelayed: boolean;
  /** Foto tomada desde la app cuando el cliente no confirma la entrega. */
  deliveryProofUrl?: string;
  createdAt: Date;
}

export class Order extends Entity<OrderProps> {
  static create(id: string, props: Omit<OrderProps, 'status' | 'createdAt' | 'prepDelayed' | 'offeredTo'>): Order {
    if (!props.items.length) throw new DomainError('El pedido debe tener al menos un producto');
    if (props.commissionRate < 0 || props.commissionRate > 1) throw new DomainError('Comisión inválida');
    return new Order(id, {
      ...props,
      status: OrderStatus.PENDING_ASSIGNMENT,
      offeredTo: [],
      prepDelayed: false,
      createdAt: new Date(),
    });
  }

  get status() { return this.props.status; }
  get courierId() { return this.props.courierId; }
  get offeredTo() { return [...this.props.offeredTo]; }
  get prepDelayed() { return this.props.prepDelayed; }

  get itemsTotal(): number {
    return this.props.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  }

  /** Tiempo estimado de preparación: el del producto que más tarda. */
  get estimatedPrepMinutes(): number {
    return Math.max(...this.props.items.map((i) => i.prepMinutes));
  }

  /** Lo que RapiChonta cobra al domiciliario por este servicio. */
  get commissionAmount(): number {
    return Math.round(this.props.deliveryFee * this.props.commissionRate);
  }

  /**
   * Notifica el pedido. El operador puede elegir un domiciliario específico o enviarlo a todos
   * los disponibles; en ambos casos el primero que acepte se queda con el servicio.
   */
  offerTo(courierIds: string[]): void {
    if (!courierIds.length) throw new DomainError('Debe haber al menos un domiciliario para ofrecer el pedido');
    this.transitionTo(OrderStatus.OFFERED);
    this.props.offeredTo = [...new Set(courierIds)];
  }

  /** Nadie aceptó a tiempo: el pedido vuelve a la cola del operador. */
  releaseOffer(): void {
    this.transitionTo(OrderStatus.PENDING_ASSIGNMENT);
    this.props.offeredTo = [];
  }

  accept(courierId: string): void {
    if (!this.props.offeredTo.includes(courierId)) {
      throw new DomainError('El pedido no fue ofrecido a este domiciliario');
    }
    this.transitionTo(OrderStatus.ACCEPTED);
    this.props.courierId = courierId;
    this.props.offeredTo = [];
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

  /** El cliente no confirmó la entrega: el domiciliario sube la foto y el operador revisa. */
  submitDeliveryProof(photoUrl: string): void {
    if (!photoUrl) throw new DomainError('La foto de entrega es obligatoria');
    this.transitionTo(OrderStatus.PENDING_REVIEW);
    this.props.deliveryProofUrl = photoUrl;
  }

  transitionTo(next: OrderStatus): void {
    if (!canTransition(this.props.status, next)) {
      throw new DomainError(`No se puede pasar de ${this.props.status} a ${next}`);
    }
    this.props.status = next;
  }
}
