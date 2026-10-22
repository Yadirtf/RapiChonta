import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ChangeCourierMunicipalityUseCase } from '../../application/use-cases/admin/change-courier-municipality.use-case';
import { ChangeCourierVerificationUseCase } from '../../application/use-cases/admin/change-courier-verification.use-case';
import { ChangeUserStatusUseCase } from '../../application/use-cases/admin/change-user-status.use-case';
import { CreateCourierUseCase } from '../../application/use-cases/admin/create-courier.use-case';
import { CreateStaffMemberUseCase, ListStaffUseCase } from '../../application/use-cases/admin/create-staff-member.use-case';
import { GetCourierUseCase, ListCouriersUseCase } from '../../application/use-cases/admin/list-couriers.use-case';
import { PERMISSIONS, ROLES } from '../../domain/identity.codes';
import { Principal } from '../../domain/principal';
import { IdentityOptionsRepository } from '../../domain/ports/identity-options.repository';
import { CurrentPrincipal, RequirePermissions, Roles } from './decorators/auth.decorators';
import { ChangeCourierMunicipalityDto, ChangeUserStatusDto, ChangeVerificationDto, CreateCourierDto, CreateStaffDto, ListCouriersQueryDto } from './dto/admin.dto';

/** Panel del administrador (H01.3, H01.4). El operador no tiene estos permisos: la API los rechaza. */
@Controller('admin')
@Roles(ROLES.ADMIN, ROLES.OPERATOR)
export class AdminIdentityController {
  constructor(
    private readonly createCourier: CreateCourierUseCase,
    private readonly listCouriers: ListCouriersUseCase,
    private readonly getCourier: GetCourierUseCase,
    private readonly changeVerification: ChangeCourierVerificationUseCase,
    private readonly changeMunicipality: ChangeCourierMunicipalityUseCase,
    private readonly changeUserStatus: ChangeUserStatusUseCase,
    private readonly createStaff: CreateStaffMemberUseCase,
    private readonly listStaff: ListStaffUseCase,
    private readonly options: IdentityOptionsRepository,
  ) {}

  /** Opciones de los formularios: tipos de documento, vehículos, medios de cobro, bancos, municipios. */
  @Get('identity/options')
  @RequirePermissions(PERMISSIONS.COURIERS_MANAGE)
  identityOptions() {
    return this.options.load();
  }

  @Get('couriers')
  @RequirePermissions(PERMISSIONS.COURIERS_MANAGE)
  couriers(@Query() query: ListCouriersQueryDto) {
    return this.listCouriers.execute({ verificationStatus: query.status, search: query.q });
  }

  @Post('couriers')
  @RequirePermissions(PERMISSIONS.COURIERS_MANAGE)
  async newCourier(@CurrentPrincipal() principal: Principal, @Body() body: CreateCourierDto) {
    const userId = await this.createCourier.execute(principal, body);
    return this.getCourier.execute(userId);
  }

  @Get('couriers/:userId')
  @RequirePermissions(PERMISSIONS.COURIERS_MANAGE)
  courier(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.getCourier.execute(userId);
  }

  @Post('couriers/:userId/verification')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.COURIERS_VERIFY)
  async verification(
    @CurrentPrincipal() principal: Principal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ChangeVerificationDto,
  ) {
    await this.changeVerification.execute(principal, { userId, to: body.status, reason: body.reason });
    return this.getCourier.execute(userId);
  }

  /** Corrige el municipio del domiciliario (el despacho de cada municipio solo ve a los suyos). */
  @Post('couriers/:userId/municipality')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.COURIERS_MANAGE)
  async municipality(
    @CurrentPrincipal() principal: Principal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ChangeCourierMunicipalityDto,
  ) {
    await this.changeMunicipality.execute(principal, { userId, municipalityId: body.municipalityId });
    return this.getCourier.execute(userId);
  }

  /** Suspender, desactivar o reactivar cualquier cuenta; el permiso exacto lo decide el caso de uso. */
  @Post('users/:userId/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async userStatus(
    @CurrentPrincipal() principal: Principal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ChangeUserStatusDto,
  ) {
    await this.changeUserStatus.execute(principal, { userId, to: body.status, reason: body.reason });
  }

  @Get('staff')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE_STAFF)
  staff() {
    return this.listStaff.execute();
  }

  @Post('staff')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE_STAFF)
  async newStaff(@CurrentPrincipal() principal: Principal, @Body() body: CreateStaffDto) {
    const userId = await this.createStaff.execute(principal, body);
    return { userId };
  }
}
