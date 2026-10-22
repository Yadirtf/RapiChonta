import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileUrls } from '../../../files/application/file-urls';
import { ROLES } from '../../../identity/domain/identity.codes';
import { Principal } from '../../../identity/domain/principal';
import { CurrentPrincipal, RequirePermissions, Roles } from '../../../identity/presentation/http/decorators/auth.decorators';
import { CourierAvailabilityUseCase, CourierOffersUseCase } from '../../application/courier.use-cases';
import { DispatchBoardUseCase, SendOfferUseCase } from '../../application/dispatch-board.use-cases';
import { StaffActivityUseCase } from '../../application/staff-activity.use-cases';
import { COURIER_FRESH_SECONDS, DISPATCH_PERMISSIONS as P } from '../../domain/dispatch.codes';
import { DispatchPresenter as V } from './dispatch-presenter';
import { AuditQueryDto, AvailabilityDto, BoardQueryDto, CouriersQueryDto, LocationBatchDto, OffersQueryDto, SendOfferDto } from './dispatch.dto';
import { contentLanguage } from '../../../catalog/application/public/get-establishment.use-case';

/** El panel consulta cada 5 s: el límite global (100/min) se queda corto con dos pantallas abiertas. */
const POLLING = { default: { limit: 240, ttl: 60_000 } };

/** H07.1-H07.3: la central de despacho del operador. Solo OPERATOR y ADMIN (RF-31). */
@Controller('dispatch')
@Roles(ROLES.OPERATOR, ROLES.ADMIN)
export class DispatchController {
  constructor(
    private readonly board: DispatchBoardUseCase,
    private readonly sendOffer: SendOfferUseCase,
    private readonly urls: FileUrls,
  ) {}

  /** GET /api/v1/dispatch/orders — pedidos activos del municipio con sus ofertas vivas y domiciliario. */
  @Throttle(POLLING)
  @Get('orders')
  @RequirePermissions(P.READ_ALL)
  async orders(@CurrentPrincipal() principal: Principal, @Query() query: BoardQueryDto) {
    const { municipality, orders } = await this.board.orders(principal, query.municipalityId);
    return { municipalityId: municipality.id, serverTime: new Date().toISOString(), orders: orders.map((o) => V.order(o, (fileId) => this.urls.url(fileId))) };
  }

  /** GET /api/v1/dispatch/couriers — verificados, Disponibles, vistos en los últimos 2 min y libres (H07.2). */
  @Throttle(POLLING)
  @Get('couriers')
  @RequirePermissions(P.READ_LOCATIONS)
  async couriers(@CurrentPrincipal() principal: Principal, @Query() query: CouriersQueryDto) {
    const couriers = await this.board.couriers(principal, { municipalityId: query.municipalityId, orderCode: query.order });
    return { freshSeconds: COURIER_FRESH_SECONDS, couriers: couriers.map(V.courier) };
  }

  /** POST /api/v1/dispatch/orders/:code/offers — a uno (SPECIFIC) o a todos (BROADCAST) (H07.3). */
  @Post('orders/:code/offers')
  @RequirePermissions(P.ASSIGN)
  async offer(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: SendOfferDto) {
    const offer = await this.sendOffer.execute(principal, code, { mode: body.mode, courierUserId: body.courierUserId });
    return { offerId: offer.offerId, expiresAt: offer.expiresAt.toISOString(), recipients: offer.recipients };
  }
}

/** Lado del domiciliario (H08.1 y H08.2): Disponible, ubicación y respuesta a ofertas. */
@Controller('courier')
@Roles(ROLES.COURIER)
export class CourierController {
  constructor(
    private readonly availability: CourierAvailabilityUseCase,
    private readonly offers: CourierOffersUseCase,
  ) {}

  @Get('status')
  async status(@CurrentPrincipal() principal: Principal) {
    return V.courierStatus(await this.availability.status(principal));
  }

  /** PUT /api/v1/courier/availability — activa o desactiva Disponible. */
  @Put('availability')
  @RequirePermissions(P.RESPOND)
  async setAvailability(@CurrentPrincipal() principal: Principal, @Body() body: AvailabilityDto) {
    return V.courierStatus(await this.availability.setAvailable(principal, body.available));
  }

  /** POST /api/v1/courier/locations — lecturas del GPS (varias si estuvo sin señal). */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('locations')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.REPORT_LOCATION)
  async locations(@CurrentPrincipal() principal: Principal, @Body() body: LocationBatchDto) {
    return this.availability.reportLocations(
      principal,
      body.readings.map((r) => ({ latitude: r.latitude, longitude: r.longitude, accuracyM: r.accuracyM, recordedAt: new Date(r.recordedAt), mocked: r.mocked })),
      new Date(),
      body.sentAt ? new Date(body.sentAt) : undefined,
    );
  }

  /** GET /api/v1/courier/offers — lo ofrecido con local, productos, total a comprar y tarifa (H08.2). */
  @Get('offers')
  @RequirePermissions(P.RESPOND)
  async pending(@CurrentPrincipal() principal: Principal, @Query() query: OffersQueryDto) {
    return (await this.offers.pending(principal, contentLanguage(query.lang))).map(V.courierOffer);
  }

  /** "Tomar pedido": el primero gana; si otro lo tomó responde 409 ORDER_ALREADY_TAKEN. */
  @Post('offers/:offerId/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.RESPOND)
  accept(@CurrentPrincipal() principal: Principal, @Param('offerId', ParseUUIDPipe) offerId: string) {
    return this.offers.accept(principal, offerId);
  }

  /** "No puedo". */
  @Post('offers/:offerId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.RESPOND)
  reject(@CurrentPrincipal() principal: Principal, @Param('offerId', ParseUUIDPipe) offerId: string) {
    return this.offers.reject(principal, offerId);
  }
}

/** Días del filtro en hora de Colombia (UTC-5 fija, sin horario de verano): [desde 00:00, hasta+1 00:00). */
const dayStart = (day: string) => new Date(`${day}T00:00:00-05:00`);
const dayEnd = (day: string) => new Date(dayStart(day).getTime() + 86_400_000);

/** H07.5: registro de auditoría del personal (solo lectura). */
@Controller('admin/audit')
@Roles(ROLES.ADMIN)
export class AuditController {
  constructor(private readonly activity: StaffActivityUseCase) {}

  @Get()
  @RequirePermissions(P.AUDIT)
  async list(@CurrentPrincipal() principal: Principal, @Query() query: AuditQueryDto) {
    const page = await this.activity.list(principal, {
      from: query.from ? dayStart(query.from) : undefined,
      to: query.to ? dayEnd(query.to) : undefined,
      actorUserId: query.actorUserId,
      orderCode: query.order,
      cursor: query.cursor,
      limit: query.limit,
    });
    return { entries: page.entries.map(V.activity), nextCursor: page.nextCursor };
  }

  @Get('actors')
  @RequirePermissions(P.AUDIT)
  actors(@CurrentPrincipal() principal: Principal) {
    return this.activity.actors(principal);
  }
}
