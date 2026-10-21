import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../../shared/presentation/public.decorator';
import { CurrentPrincipal, RequirePermissions } from '../../../identity/presentation/http/decorators/auth.decorators';
import { Principal } from '../../../identity/domain/principal';
import { ManageAddressesUseCase, ManageRecipientsUseCase } from '../../application/address-book.use-cases';
import { CreateOrderInput, CreateOrderUseCase, DeliveryTarget, ListPaymentMethodsUseCase, QuoteOrderUseCase } from '../../application/checkout.use-cases';
import { GetMyOrderUseCase, ListMyOrdersUseCase } from '../../application/my-orders.use-cases';
import { ORDER_PERMISSIONS } from '../../domain/orders.codes';
import { CreateOrderDto, DeliveryDto, MyOrdersQueryDto, OrderQueryDto, QuoteOrderDto, RecipientDto, SaveAddressDto } from './orders.dto';
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

  /** GET /api/v1/orders/payment-methods — medios contra entrega activos (RF-22). */
  @Public()
  @Get('payment-methods')
  @Header('Cache-Control', 'public, max-age=300')
  async methods() {
    return (await this.paymentMethods.execute()).map((code) => ({ code }));
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
    return { active: page.active.map((o) => this.presenter.summary(o)), past: page.past.map((o) => this.presenter.summary(o)), nextBefore: page.nextBefore, journey: page.journey };
  }

  /** GET /api/v1/orders/RC-7K3M — detalle y línea de tiempo (RF-50). */
  @Get(':code')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(ORDER_PERMISSIONS.READ_OWN)
  async detail(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Query() query: OrderQueryDto) {
    return this.presenter.detail(await this.getMine.execute(principal, code, query.lang));
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
