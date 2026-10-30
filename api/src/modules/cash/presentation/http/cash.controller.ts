import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ROLES } from '../../../identity/domain/identity.codes';
import { Principal } from '../../../identity/domain/principal';
import { CurrentPrincipal, RequirePermissions, Roles } from '../../../identity/presentation/http/decorators/auth.decorators';
import { CashBoxesUseCase } from '../../application/cash-boxes.use-cases';
import { CourierCashUseCase } from '../../application/courier-cash.use-case';
import { CASH_PERMISSIONS as P } from '../../domain/cash.codes';
import { CashPresenter } from './cash-presenter';
import { CashAdjustmentDto, CashBoardQueryDto, CloseCashBoxDto, CourierCashQueryDto, OpenCashBoxDto } from './cash.dto';

/** H11.1 y H11.3: las cajas del día en el panel. Solo administradores (cash.manage; los ajustes, cash.adjust). */
@Controller('cash/boxes')
@Roles(ROLES.ADMIN)
export class CashBoxesController {
  constructor(
    private readonly boxes: CashBoxesUseCase,
    private readonly presenter: CashPresenter,
  ) {}

  /** GET /api/v1/cash/boxes?date= — los domiciliarios del municipio con su caja de ese día. */
  @Get()
  @RequirePermissions(P.MANAGE)
  async board(@CurrentPrincipal() principal: Principal, @Query() query: CashBoardQueryDto) {
    const { municipality, date, today, couriers, methods } = await this.boxes.board(principal, query);
    return { municipalityId: municipality.id, date, today, methods, couriers: couriers.map((c) => this.presenter.row(c)) };
  }

  /** GET /api/v1/cash/boxes/:id — el libro de la caja, sus pedidos, lo entregado sin cobro y el desglose. */
  @Get(':id')
  @RequirePermissions(P.MANAGE)
  async detail(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.presenter.detail(await this.boxes.detail(principal, id));
  }

  /** POST /api/v1/cash/boxes/open — la base de hoy (modo CASH_BOX). */
  @Post('open')
  @RequirePermissions(P.MANAGE)
  open(@CurrentPrincipal() principal: Principal, @Body() body: OpenCashBoxDto) {
    return this.boxes.open(principal, body);
  }

  /** POST /api/v1/cash/boxes/:id/adjustments — una corrección firmada, con nota. */
  @Post(':id/adjustments')
  @RequirePermissions(P.ADJUST)
  adjust(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: CashAdjustmentDto) {
    return this.boxes.adjust(principal, id, body);
  }

  /** POST /api/v1/cash/boxes/:id/close — lo que entregó y el cierre; responde la diferencia que quedó. */
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.MANAGE)
  close(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: CloseCashBoxDto) {
    return this.boxes.close(principal, id, body);
  }
}

/** H11.4: el domiciliario ve su caja del día. */
@Controller('courier/cash-box')
@Roles(ROLES.COURIER)
export class CourierCashController {
  constructor(
    private readonly cash: CourierCashUseCase,
    private readonly presenter: CashPresenter,
  ) {}

  /** GET /api/v1/courier/cash-box?date= — su caja de hoy (o de ese día) y si hoy puede recibir ofertas. */
  @Get()
  @RequirePermissions(P.READ_OWN)
  async mine(@CurrentPrincipal() principal: Principal, @Query() query: CourierCashQueryDto) {
    const { day, date, box } = await this.cash.mine(principal, query.date);
    return { date, ...this.presenter.day(day), box: box && this.presenter.detail(box) };
  }
}
