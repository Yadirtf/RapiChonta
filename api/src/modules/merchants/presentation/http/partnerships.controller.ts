import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ROLES } from '../../../identity/domain/identity.codes';
import { Principal } from '../../../identity/domain/principal';
import { CurrentPrincipal, RequirePermissions, Roles } from '../../../identity/presentation/http/decorators/auth.decorators';
import { ManagePartnershipsUseCase } from '../../application/partnerships.use-cases';
import { MERCHANT_PERMISSIONS as P } from '../../domain/merchants.codes';
import { MerchantsPresenter } from './merchants-presenter';
import { EndPartnershipDto, StartPartnershipDto, StoreMemberDto } from './merchants.dto';

/** H15.1 en el panel: el convenio del local y quién lo atiende en el portal. Solo el administrador. */
@Controller('admin/establishments/:id')
@Roles(ROLES.ADMIN)
export class PartnershipsController {
  constructor(
    private readonly partnerships: ManagePartnershipsUseCase,
    private readonly presenter: MerchantsPresenter,
  ) {}

  /** GET /api/v1/admin/establishments/:id/partnership — el convenio vigente, el próximo, los anteriores y el personal. */
  @Get('partnership')
  @RequirePermissions(P.MANAGE_PARTNERS)
  async view(@Param('id', ParseUUIDPipe) id: string) {
    return this.presenter.partnership(await this.partnerships.view(id));
  }

  @Post('partnership')
  @RequirePermissions(P.MANAGE_PARTNERS)
  async start(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: StartPartnershipDto) {
    return this.presenter.partnership(await this.partnerships.start(principal, id, body));
  }

  @Post('partnership/end')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.MANAGE_PARTNERS)
  async end(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: EndPartnershipDto) {
    return this.presenter.partnership(await this.partnerships.end(principal, id, body));
  }

  @Post('staff')
  @RequirePermissions(P.MANAGE_PARTNERS)
  async addMember(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: StoreMemberDto) {
    return this.presenter.partnership(await this.partnerships.addMember(principal, id, body));
  }

  @Delete('staff/:staffId')
  @RequirePermissions(P.MANAGE_PARTNERS)
  async revokeMember(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Param('staffId', ParseUUIDPipe) staffId: string) {
    return this.presenter.partnership(await this.partnerships.revokeMember(principal, id, staffId));
  }
}
