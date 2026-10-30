import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ROLES } from '../../../identity/domain/identity.codes';
import { Principal } from '../../../identity/domain/principal';
import { CurrentPrincipal, RequirePermissions, Roles } from '../../../identity/presentation/http/decorators/auth.decorators';
import { MerchantPortalUseCase } from '../../application/merchant-portal.use-cases';
import { MERCHANT_PERMISSIONS as P } from '../../domain/merchants.codes';
import { MerchantsPresenter } from './merchants-presenter';
import { AcceptOrderDto, DeclineOrderDto, StoreAvailabilityDto } from './merchants.dto';

/** El mostrador consulta cada pocos segundos, como el despacho: el límite global no alcanza con la pantalla abierta. */
const POLLING = { default: { limit: 240, ttl: 60_000 } };

/** H15.1: el portal del comercio aliado. Solo el rol MERCHANT, y solo sobre los locales que atiende. */
@Controller('merchant')
@Roles(ROLES.MERCHANT)
export class MerchantPortalController {
  constructor(
    private readonly portal: MerchantPortalUseCase,
    private readonly presenter: MerchantsPresenter,
  ) {}

  /** GET /api/v1/merchant/stores — los locales que atiende, con lo que espera respuesta y lo que prepara. */
  @Throttle(POLLING)
  @Get('stores')
  @RequirePermissions(P.RESPOND_ORDERS)
  async stores(@CurrentPrincipal() principal: Principal) {
    return { serverTime: new Date().toISOString(), stores: (await this.portal.stores(principal)).map((s) => this.presenter.store(s)) };
  }

  /** GET /api/v1/merchant/options — motivos de rechazo y el rango del tiempo de preparación. */
  @Get('options')
  @RequirePermissions(P.RESPOND_ORDERS)
  options() {
    return this.portal.options();
  }

  /** GET /api/v1/merchant/stores/:id/orders — el mostrador: por aceptar, en preparación, listos y cerrados hoy. */
  @Throttle(POLLING)
  @Get('stores/:id/orders')
  @RequirePermissions(P.RESPOND_ORDERS)
  async counter(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { serverTime: new Date().toISOString(), orders: await this.portal.counter(principal, id) };
  }

  /** POST /api/v1/merchant/orders/:code/accept — con el tiempo real de preparación; pasa al despacho. */
  @Post('orders/:code/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.RESPOND_ORDERS)
  accept(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: AcceptOrderDto) {
    return this.portal.accept(principal, code, body.preparationMinutes);
  }

  /** POST /api/v1/merchant/orders/:code/decline — con el motivo; el cliente recibe el aviso. */
  @Post('orders/:code/decline')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.RESPOND_ORDERS)
  decline(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: DeclineOrderDto) {
    return this.portal.decline(principal, code, { reason: body.reason, notes: body.notes });
  }

  /** POST /api/v1/merchant/orders/:code/ready — listo para recoger: avisa al domiciliario que lo lleva. */
  @Post('orders/:code/ready')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.RESPOND_ORDERS)
  ready(@CurrentPrincipal() principal: Principal, @Param('code') code: string) {
    return this.portal.markReady(principal, code);
  }

  /** POST /api/v1/merchant/stores/:id/availability — abrir o pausar el local. */
  @Post('stores/:id/availability')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.MANAGE_STATUS)
  availability(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: StoreAvailabilityDto) {
    return this.portal.setOpen(principal, id, body.open);
  }
}
