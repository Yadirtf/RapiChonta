import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ROLES } from '../../../identity/domain/identity.codes';
import { Principal } from '../../../identity/domain/principal';
import { CurrentPrincipal, RequirePermissions, Roles } from '../../../identity/presentation/http/decorators/auth.decorators';
import { DeskUseCase } from '../../application/desk.use-cases';
import { OPERATIONS_PERMISSIONS as P } from '../../domain/operations.codes';
import { DeskPresenter } from './desk-presenter';
import { CancelOrderDto, DeskQueryDto, ResolveIncidentDto, ReviewProofDto } from './desk.dto';

/** El panel consulta cada 5 s, como el despacho: el límite global (100/min) no alcanza con dos pantallas abiertas. */
const POLLING = { default: { limit: 240, ttl: 60_000 } };

/** H10.5: pedidos en curso, revisión de fotos de entrega, novedades y cancelación. Solo OPERATOR y ADMIN. */
@Controller('desk')
@Roles(ROLES.OPERATOR, ROLES.ADMIN)
export class DeskController {
  constructor(
    private readonly desk: DeskUseCase,
    private readonly presenter: DeskPresenter,
  ) {}

  /** GET /api/v1/desk/orders — lo que está en curso en el municipio, con sus alertas (lo más urgente primero). */
  @Throttle(POLLING)
  @Get('orders')
  @RequirePermissions(P.READ_ALL)
  async orders(@CurrentPrincipal() principal: Principal, @Query() query: DeskQueryDto) {
    const { municipality, orders } = await this.desk.board(principal, query.municipalityId);
    return { municipalityId: municipality.id, serverTime: new Date().toISOString(), orders: orders.map((o) => this.presenter.order(o)) };
  }

  /** GET /api/v1/desk/cancellation-reasons — los motivos que el personal elige al cancelar. */
  @Get('cancellation-reasons')
  @RequirePermissions(P.CANCEL)
  async reasons() {
    return { reasons: await this.desk.cancellationReasons() };
  }

  /** GET /api/v1/desk/orders/:code — el detalle con la línea de tiempo completa, la foto y el cobro. */
  @Throttle(POLLING)
  @Get('orders/:code')
  @RequirePermissions(P.READ_ALL)
  async detail(@CurrentPrincipal() principal: Principal, @Param('code') code: string) {
    return this.presenter.detail(await this.desk.detail(principal, code));
  }

  /** POST /api/v1/desk/orders/:code/cancel — antes de la compra, con motivo y comentario. */
  @Post('orders/:code/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.CANCEL)
  cancel(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: CancelOrderDto) {
    return this.desk.cancel(principal, code, { reason: body.reason, notes: body.notes });
  }

  /** POST /api/v1/desk/orders/:code/proof-review — entregado, abrir caso o cancelado, con comentario. */
  @Post('orders/:code/proof-review')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.REVIEW_PROOF)
  reviewProof(@CurrentPrincipal() principal: Principal, @Param('code') code: string, @Body() body: ReviewProofDto) {
    return this.desk.reviewProof(principal, code, { outcome: body.outcome, notes: body.notes, incidentType: body.incidentType });
  }

  /** POST /api/v1/desk/incidents/:id/take — "Lo reviso yo": los demás ven quién la tiene. */
  @Post('incidents/:id/take')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.RESOLVE_INCIDENT)
  take(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.desk.takeIncident(principal, id);
  }

  /** POST /api/v1/desk/incidents/:id/resolve — entregado o cancelado, con comentario. */
  @Post('incidents/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.RESOLVE_INCIDENT)
  resolve(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: ResolveIncidentDto) {
    return this.desk.resolveIncident(principal, id, { resolution: body.resolution, notes: body.notes });
  }
}
