import { Injectable } from '@nestjs/common';
import { EnsureOpenForOrders } from '../../business-config/application/schedule.use-cases';
import { QuoteDeliveryUseCase } from '../../business-config/application/zones.use-cases';
import { DeliveryQuote } from '../../business-config/domain/ports/zones.repository';
import { contentLanguage } from '../../catalog/application/public/get-establishment.use-case';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { Principal } from '../../identity/domain/principal';
import { PhoneNumber } from '../../identity/domain/value-objects/phone-number';
import { CartItem, Checkout, CHECKOUT_LIMITS } from '../domain/checkout';
import { OrderErrors } from '../domain/orders.errors';
import { AddressBook, NewAddress, RecipientBook } from '../domain/ports/address-book';
import { CheckoutReader, OrderingEstablishment } from '../domain/ports/checkout.reader';
import { ClientRequestReplayed, NewOrder, OrderCodeTaken, OrdersRepository } from '../domain/ports/orders.repository';
import { OrderCode } from '../domain/value-objects/order-code';

/** Dónde se entrega: una dirección guardada o un punto (ubicación actual o elegido en el mapa) con referencia. */
/** La referencia es obligatoria al confirmar; para cotizar basta el punto (el cliente ve la tarifa mientras mueve el pin). */
export type DeliveryTarget = { addressId: string } | { latitude: number; longitude: number; reference?: string | null; line?: string | null; label?: string | null };

export interface QuoteInput {
  establishmentId: string;
  items: CartItem[];
  delivery: DeliveryTarget;
  language?: string;
}

export interface CreateOrderInput extends QuoteInput {
  paymentMethod: string;
  /** Pedido para otra persona: uno guardado o nombre y teléfono nuevos. */
  recipient?: { recipientId: string } | { fullName: string; phone: string } | null;
  notes?: string | null;
  clientRequestId: string;
}

export interface Quote {
  establishment: OrderingEstablishment;
  checkout: Checkout;
  delivery: DeliveryQuote;
}

const MAX_CODE_ATTEMPTS = 6;
const clean = (value: string | null | undefined, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '') || null;

/**
 * Arma el pedido como lo cobraría RapiChonta: local que recibe pedidos, menú vigente, tarifa de la zona
 * donde cae la entrega y tope de cliente nuevo. Lo comparten la cotización y la confirmación.
 */
@Injectable()
export class CheckoutBuilder {
  constructor(
    private readonly reader: CheckoutReader,
    private readonly addresses: AddressBook,
    private readonly deliveryQuote: QuoteDeliveryUseCase,
  ) {}

  async build(principal: Principal, input: QuoteInput, options: { requireReference: boolean }): Promise<Quote & { target: { id: string } | NewAddress }> {
    const establishment = await this.reader.establishment(input.establishmentId);
    if (!establishment) throw OrderErrors.establishmentNotFound();
    if (!establishment.acceptsOrders) throw OrderErrors.establishmentNotAccepting();

    const { target, location } = await this.target(principal.userId, input.delivery, options.requireReference);
    const ids = [...new Set((input.items ?? []).map((i) => i.productVersionId))];
    const [delivery, menu, exposure, newCustomerLimit] = await Promise.all([
      this.deliveryQuote.execute({ establishmentId: establishment.id, latitude: location.latitude, longitude: location.longitude }),
      this.reader.menuVersions(ids, contentLanguage(input.language)),
      this.reader.exposure(principal.userId),
      this.reader.newCustomerLimit(establishment.municipalityId),
    ]);
    const checkout = Checkout.build({ establishmentId: establishment.id, items: input.items ?? [], menu, fee: delivery.fee, exposure, newCustomerLimit });
    return { establishment, checkout, delivery, target };
  }

  private async target(ownerUserId: string, delivery: DeliveryTarget, requireReference: boolean): Promise<{ target: { id: string } | NewAddress; location: GeoPoint }> {
    if ('addressId' in delivery) {
      const saved = await this.addresses.find(ownerUserId, delivery.addressId);
      if (!saved) throw OrderErrors.addressNotFound();
      return { target: { id: saved.id }, location: saved.location };
    }
    const reference = clean(delivery.reference, 200);
    if (requireReference && (!reference || reference.length < 3)) throw OrderErrors.referenceRequired();
    const location = GeoPoint.create(delivery.latitude, delivery.longitude);
    return { target: { label: clean(delivery.label, 40), line: clean(delivery.line, 200), reference: reference ?? '', location }, location };
  }
}

/** H04.1: total antes de confirmar (productos + tarifa de la zona) y cuánto le queda al cliente nuevo. */
@Injectable()
export class QuoteOrderUseCase {
  constructor(private readonly builder: CheckoutBuilder) {}

  async execute(principal: Principal, input: QuoteInput): Promise<Quote> {
    const { target: _target, ...quote } = await this.builder.build(principal, input, { requireReference: false });
    return quote;
  }
}

/**
 * H04.3: confirma el pedido. Rechaza fuera de horario, con productos no disponibles o con otro precio,
 * fuera de cobertura y por encima del tope de cliente nuevo. Crea el pedido en PENDING_ASSIGNMENT con
 * código RC-XXXX; cada línea apunta a la versión vigente del producto (nombre, precio y tiempo fijados).
 */
@Injectable()
export class CreateOrderUseCase {
  constructor(
    private readonly builder: CheckoutBuilder,
    private readonly reader: CheckoutReader,
    private readonly orders: OrdersRepository,
    private readonly recipients: RecipientBook,
    private readonly ensureOpen: EnsureOpenForOrders,
  ) {}

  async execute(principal: Principal, input: CreateOrderInput, now = new Date()): Promise<{ code: string; replayed: boolean }> {
    // Reintento del mismo dispositivo: se devuelve el pedido ya creado en vez de crear otro.
    const previous = await this.orders.findByClientRequest(input.clientRequestId);
    if (previous) return this.replay(principal, previous);

    const { establishment, checkout, delivery, target } = await this.builder.build(principal, input, { requireReference: true });
    await this.ensureOpen.execute(establishment.municipalityId, now);
    checkout.assertWithinNewCustomerLimit();

    const [methods, commissionRateId] = await Promise.all([this.reader.paymentMethods(), this.reader.commissionRateId(establishment.municipalityId)]);
    if (!methods.includes(input.paymentMethod)) throw OrderErrors.paymentMethodUnavailable();
    if (!commissionRateId) throw OrderErrors.ordersNotConfigured();
    const recipient = await this.recipient(principal, input.recipient);

    const order: Omit<NewOrder, 'code'> = {
      customerUserId: principal.userId,
      establishmentId: establishment.id,
      address: target,
      recipient,
      deliveryZoneFeeId: delivery.deliveryZoneFeeId,
      commissionRateId,
      paymentMethod: input.paymentMethod,
      customerNotes: clean(input.notes, CHECKOUT_LIMITS.customerNotes),
      lines: checkout.lines.map((l) => ({ productVersionId: l.productVersionId, quantity: l.quantity, notes: l.notes })),
      clientRequestId: input.clientRequestId,
    };

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = OrderCode.generate(attempt);
      try {
        await this.orders.create({ ...order, code });
        return { code, replayed: false };
      } catch (error) {
        if (error instanceof ClientRequestReplayed) return this.replay(principal, error.order);
        if (!(error instanceof OrderCodeTaken)) throw error;
      }
    }
    throw new Error('No se pudo generar un código de pedido libre');
  }

  private replay(principal: Principal, order: { code: string; customerUserId: string }) {
    if (order.customerUserId !== principal.userId) throw OrderErrors.requestReused();
    return { code: order.code, replayed: true };
  }

  private async recipient(principal: Principal, input: CreateOrderInput['recipient']): Promise<NewOrder['recipient']> {
    if (!input) return null;
    if ('recipientId' in input) {
      if (!(await this.recipients.find(principal.userId, input.recipientId))) throw OrderErrors.recipientNotFound();
      return { id: input.recipientId };
    }
    const fullName = clean(input.fullName, 120);
    if (!fullName || fullName.length < 2) throw OrderErrors.recipientNameRequired();
    return { fullName, phoneE164: PhoneNumber.parse(input.phone).e164 };
  }
}
