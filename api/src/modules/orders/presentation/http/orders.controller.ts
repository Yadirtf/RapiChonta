import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../../shared/presentation/public.decorator';
import { ROLES } from '../../../identity/domain/identity.codes';
import { CurrentPrincipal, RequirePermissions, Roles } from '../../../identity/presentation/http/decorators/auth.decorators';
import { Principal } from '../../../identity/domain/principal';
import { ManageAddressesUseCase, ManageRecipientsUseCase } from '../../application/address-book.use-cases';
import { CreateOrderInput, CreateOrderUseCase, DeliveryTarget, QuoteOrderUseCase } from '../../application/checkout.use-cases';
import { ListPaymentMethodsUseCase, ManagePaymentOptionsUseCase } from '../../application/payment-options.use-cases';
import { GetMyOrderUseCase, ListMyOrdersUseCase } from '../../application/my-orders.use-cases';
import { DEFAULT_FULFILLMENT_MODE, ORDER_PERMISSIONS, PAYMENT_OPTIONS_PERMISSION } from '../../domain/orders.codes';
import { CreateOrderDto, DeliveryDto, MyOrdersQueryDto, OrderQueryDto, PaymentOptionDto, PaymentOrderDto, QuoteOrderDto, RecipientDto, SaveAddressDto } from './orders.dto';
import { OrdersPresenter } from './orders-presenter';

const delivery = (d: DeliveryDto): DeliveryTarget =>
  d.addressId ? { addressId: d.addressId } : { latitude: d.latitude!, longitude: d.longitude!, reference: d.reference, line: d.line, label: d.label };

const recipient = (r?: RecipientDto | null): CreateOrderInput['recipient'] =>
  !r ? null : r.recipientId ? { recipientId: r.recipientId } : { fullName: r.fullName!, phone: r.phone! };

/** E04: el cliente cotiza, confirma y sigue sus pedidos. Cada cliente solo opera sobre lo suyo (id de la sesión). */
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly quoteOrder: QuoteOrderUseCase,
    private readonly createOrder: CreateOrderUseCase,
    private readonly paymentMethods: ListPaymentMethodsUseCase,
    private readonly listMine: ListMyOrdersUseCase,
    private readonly getMine: GetMyOrderUseCase,
    private readonly presenter: OrdersPresenter,
  ) {}

  /** GET /api/v1/orders/payment-methods — medios contra entrega que el panel deja ver, con su imagen (RF-22). */
  @Public()
  @Get('payment-methods')
  @Header('Cache-Control', 'public, max-age=60')
  async methods() {
    return (await this.paymentMethods.execute()).map((m) => this.presenter.paymentMethod(m));
  }

  /** POST /api/v1/orders/quote — total con la tarifa de la zona de entrega y el tope de cliente nuevo (H04.1). */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(ORDER_PERMISSIONS.CREATE)
  async quote(@CurrentPrincipal() principal: Principal, @Body() body: QuoteOrderDto) {
    const quote = await this.quoteOrder.execute(principal, { establishmentId: body.establishmentId, items: body.items, delivery: delivery(body.delivery), language: body.lang });
    return this.presenter.quote(quote);
  }

  /** POST /api/v1/orders — confirma el pedido (H04.3). Repetir el mismo clientRequestId devuelve el mismo pedido. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @RequirePermissions(ORDER_PERMISSIONS.CREATE)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: CreateOrderDto) {
    const { code } = await this.createOrder.execute(principal, {
      establishmentId: body.establishmentId,
      items: body.items,
      delivery: delivery(body.delivery),
      language: body.lang,
      paymentMethod: body.paymentMethod,
      fulfillmentMode: body.fulfillmentMode,
      recipient: recipient(body.recipient),
      notes: body.notes,
      clientRequestId: body.clientRequestId,
    });
    return this.presenter.detail(await this.getMine.execute(principal, code, body.lang));
  }

  /** GET /api/v1/orders?before=..&limit=.. — activos primero y el historial paginado (H04.4). */
  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(ORDER_PERMISSIONS.READ_OWN)
  async mine(@CurrentPrincipal() principal: Principal, @Query() query: MyOrdersQueryDto) {
    const page = await this.listMine.execute(principal, { before: query.before ? new Date(query.before) : undefined, limit: query.limit });
    return {
      active: page.active.map((o) => this.presenter.summary(o)),
      past: page.past.map((o) => this.presenter.summary(o)),
      nextBefore: page.nextBefore,
      // `journey` es el de la compra por RapiChonta, para las apps de antes de E15; cada pedido sigue el de su modo.
      journey: page.journeys[DEFAULT_FULFILLMENT_MODE] ?? [],
      journeys: page.journeys,
    };
  }

  /** GET /api/v1/orders/RC-7K3M — detalle y línea de tiempo (RF-50). */
  @Get(':code')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(ORDER_PERMISSIONS.READ_OWN)
  async detail(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Query() query: OrderQueryDto) {
    return this.presenter.detail(await this.getMine.execute(principal, code, query.lang));
  }
}

/** Panel: qué medios de pago ven los clientes en "¿Cómo pagas al recibir?", su orden y su imagen. */
@Controller('admin/payment-methods')
@Roles(ROLES.ADMIN)
@RequirePermissions(PAYMENT_OPTIONS_PERMISSION)
export class AdminPaymentMethodsController {
  constructor(
    private readonly options: ManagePaymentOptionsUseCase,
    private readonly presenter: OrdersPresenter,
  ) {}

  @Get()
  async list() {
    return (await this.options.list()).map((o) => this.presenter.paymentOption(o));
  }

  @Put('order')
  async reorder(@CurrentPrincipal() principal: Principal, @Body() body: PaymentOrderDto) {
    return (await this.options.reorder(principal, body.codes)).map((o) => this.presenter.paymentOption(o));
  }

  @Patch(':code')
  async update(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: PaymentOptionDto) {
    return (await this.options.update(principal, code, { offered: body.offered, imageFileId: body.imageFileId })).map((o) => this.presenter.paymentOption(o));
  }
}

/** H04.2: direcciones y destinatarios guardados del cliente. */
@Controller('me')
@RequirePermissions(ORDER_PERMISSIONS.CREATE)
export class CustomerBookController {
  constructor(
    private readonly addresses: ManageAddressesUseCase,
    private readonly recipients: ManageRecipientsUseCase,
    private readonly presenter: OrdersPresenter,
  ) {}

  @Get('addresses')
  async listAddresses(@CurrentPrincipal() principal: Principal) {
    return (await this.addresses.list(principal)).map((a) => this.presenter.address(a));
  }

  /** `{ address: null }` si aún no tiene pedidos (o archivó esa dirección). */
  @Get('addresses/last')
  async lastAddress(@CurrentPrincipal() principal: Principal) {
    const last = await this.addresses.lastUsed(principal);
    return { address: last ? this.presenter.address(last) : null };
  }

  @Post('addresses')
  async saveAddress(@CurrentPrincipal() principal: Principal, @Body() body: SaveAddressDto) {
    return this.presenter.address(await this.addresses.create(principal, body));
  }

  @Put('addresses/:id/default')
  @HttpCode(HttpStatus.NO_CONTENT)
  async defaultAddress(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    await this.addresses.makeDefault(principal, id);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveAddress(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    await this.addresses.archive(principal, id);
  }

  @Get('recipients')
  async listRecipients(@CurrentPrincipal() principal: Principal) {
    return (await this.recipients.list(principal)).map((r) => this.presenter.recipient(r));
  }

  @Delete('recipients/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveRecipient(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    await this.recipients.archive(principal, id);
  }
}
