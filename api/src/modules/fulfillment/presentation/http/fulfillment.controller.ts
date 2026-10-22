import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { contentLanguage } from '../../../catalog/application/public/get-establishment.use-case';
import { ROLES } from '../../../identity/domain/identity.codes';
import { Principal } from '../../../identity/domain/principal';
import { CurrentPrincipal, RequirePermissions, Roles } from '../../../identity/presentation/http/decorators/auth.decorators';
import { OrderCode } from '../../../orders/domain/value-objects/order-code';
import { CourierTripUseCase, CustomerDeliveryUseCase } from '../../application/courier-trip.use-cases';
import { TripEvent } from '../../domain/event-time';
import { FULFILLMENT_PERMISSIONS as P } from '../../domain/fulfillment.codes';
import { FulfillmentErrors } from '../../domain/fulfillment.errors';
import { FulfillmentPresenter } from './fulfillment-presenter';
import { DeliverDto, DeliveryProofDto, PurchaseDto, TripEventDto, TripQueryDto } from './fulfillment.dto';

const event = (body: TripEventDto): TripEvent => ({
  clientEventId: body.clientEventId,
  occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
  queued: body.queued === true,
});

/** Para el cliente, un código inválido es un pedido que no tiene. */
const customerOrderCode = (raw: string) => {
  const code = OrderCode.normalize(raw);
  if (!code) throw FulfillmentErrors.orderNotFound();
  return code;
};

/** El pedido debe ser un código válido; si no, es un pedido que no tiene (404, sin revelar nada). */
const orderCode = (raw: string) => {
  const code = OrderCode.normalize(raw);
  if (!code) throw FulfillmentErrors.tripNotFound();
  return code;
};

/**
 * H08.2-H08.8 (lado API): el pedido en curso del domiciliario. Solo COURIER con su permiso, y siempre sobre su
 * propia asignación vigente: el pedido se busca por el código Y por quien pregunta.
 */
@Controller('courier/trip')
@Roles(ROLES.COURIER)
export class CourierTripController {
  constructor(
    private readonly trips: CourierTripUseCase,
    private readonly presenter: FulfillmentPresenter,
  ) {}

  /** GET /api/v1/courier/trip — el pedido que lleva ahora (o null). */
  @Get()
  @RequirePermissions(P.PROGRESS)
  async active(@CurrentPrincipal() principal: Principal, @Query() query: TripQueryDto) {
    const trip = await this.trips.active(principal, contentLanguage(query.lang));
    return { trip: trip ? this.presenter.trip(trip) : null };
  }

  /** POST /api/v1/courier/trip/:code/purchase — total pagado y factura (H08.4). */
  @Post(':code/purchase')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.PROGRESS)
  purchase(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: PurchaseDto) {
    return this.trips.purchase(principal, orderCode(code), { ...event(body), amount: body.amount, receiptFileId: body.receiptFileId });
  }

  /** POST /api/v1/courier/trip/:code/ready — "Ya está listo" (H08.5). */
  @Post(':code/ready')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.PROGRESS)
  ready(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: TripEventDto) {
    return this.trips.ready(principal, orderCode(code), event(body));
  }

  /** POST /api/v1/courier/trip/:code/delay — "Sigue en preparación" (H08.5). */
  @Post(':code/delay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.PROGRESS)
  delay(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: TripEventDto) {
    return this.trips.delay(principal, orderCode(code), event(body));
  }

  /** POST /api/v1/courier/trip/:code/arrived — "Llegué" cuando la geocerca no lo detectó. */
  @Post(':code/arrived')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.PROGRESS)
  arrived(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: TripEventDto) {
    return this.trips.arrived(principal, orderCode(code), event(body));
  }

  /** POST /api/v1/courier/trip/:code/deliver — entrega con el código del cliente. */
  @Post(':code/deliver')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.PROGRESS)
  deliver(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: DeliverDto) {
    return this.trips.deliver(principal, orderCode(code), { ...event(body), deliveryCode: body.deliveryCode });
  }

  /** POST /api/v1/courier/trip/:code/proof — entrega con foto cuando no obtuvo el código. */
  @Post(':code/proof')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.PROGRESS)
  proof(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: DeliveryProofDto) {
    return this.trips.proof(principal, orderCode(code), { ...event(body), fileId: body.fileId });
  }
}

/** El cliente cierra la entrega de su pedido (el pedido se busca por el código Y por quien pregunta). */
@Controller('orders')
@Roles(ROLES.CUSTOMER)
export class CustomerDeliveryController {
  constructor(private readonly deliveries: CustomerDeliveryUseCase) {}

  /** POST /api/v1/orders/:code/received — "Recibí mi pedido". */
  @Post(':code/received')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.CONFIRM_DELIVERY)
  received(@CurrentPrincipal() principal: Principal, @Param('code') code: string) {
    return this.deliveries.confirmReceived(principal, customerOrderCode(code));
  }

  /** POST /api/v1/orders/:code/not-received — "No lo recibí" después de una entrega con foto. */
  @Post(':code/not-received')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.REPORT_INCIDENT)
  notReceived(@CurrentPrincipal() principal: Principal, @Param('code') code: string) {
    return this.deliveries.reportNotReceived(principal, customerOrderCode(code));
  }
}
