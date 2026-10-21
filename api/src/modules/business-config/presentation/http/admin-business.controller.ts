import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ROLES } from '../../../identity/domain/identity.codes';
import { Principal } from '../../../identity/domain/principal';
import { CurrentPrincipal, RequirePermissions, Roles } from '../../../identity/presentation/http/decorators/auth.decorators';
import { ManageCoverageUseCase } from '../../application/coverage.use-cases';
import { ExchangeRatesUseCase } from '../../application/exchange-rates.use-cases';
import { MunicipalityScope } from '../../application/municipality-scope';
import { ManageScheduleUseCase } from '../../application/schedule.use-cases';
import { ManageCommissionUseCase, ManageSettingsUseCase } from '../../application/settings.use-cases';
import { ManageZonesUseCase } from '../../application/zones.use-cases';
import { BUSINESS_PERMISSIONS, FEE_ZONE_KINDS } from '../../domain/business-config.codes';
import { RADIUS_LIMITS } from '../../domain/value-objects/geo-circle';
import { MAX_SLOTS_PER_DAY } from '../../domain/value-objects/time-slot';
import { COVERAGE_LIMITS, ZONE_LIMITS } from '../../domain/value-objects/zone-limits';
import { BusinessPresenter as P } from './business-presenter';
import {
  CommissionDto,
  CoverageDto,
  MunicipalityQueryDto,
  MunicipalityUpdateDto,
  ScheduleExceptionDto,
  SettingValueDto,
  TrimZoneDto,
  WeeklyScheduleDto,
  ZoneDto,
  ZoneOrderDto,
} from './business.dto';

const { ZONES_MANAGE, HOURS_MANAGE, SETTINGS_MANAGE, COMMISSION_MANAGE, MUNICIPALITIES_MANAGE } = BUSINESS_PERMISSIONS;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Panel del administrador: zonas y tarifas (H03.1), horario (H03.2), parámetros y comisión (H03.3), tasas (H03.4). */
@Controller('admin/business')
@Roles(ROLES.ADMIN, ROLES.OPERATOR)
export class AdminBusinessController {
  constructor(
    private readonly scope: MunicipalityScope,
    private readonly zones: ManageZonesUseCase,
    private readonly coverage: ManageCoverageUseCase,
    private readonly schedule: ManageScheduleUseCase,
    private readonly settings: ManageSettingsUseCase,
    private readonly commission: ManageCommissionUseCase,
    private readonly rates: ExchangeRatesUseCase,
  ) {}

  /** Municipios del alcance y límites de los formularios. */
  @Get('options')
  @RequirePermissions(ZONES_MANAGE)
  async options(@CurrentPrincipal() principal: Principal) {
    return {
      municipalities: (await this.scope.list(principal)).map(P.municipality),
      zoneKinds: FEE_ZONE_KINDS,
      limits: { zone: ZONE_LIMITS, coverage: COVERAGE_LIMITS, radius: RADIUS_LIMITS, slotsPerDay: MAX_SLOTS_PER_DAY },
    };
  }

  // ─────────────── Cobertura por municipio (H03.5) ───────────────

  /** Municipios del alcance con su cobertura, cuántas zonas tienen y qué les falta para abrir. */
  @Get('coverage')
  @RequirePermissions(ZONES_MANAGE)
  async coverageOverview(@CurrentPrincipal() principal: Principal) {
    return (await this.coverage.overview(principal)).map(P.overview);
  }

  /** Crea o reemplaza la cobertura; si solo cambia la tarifa base, la zona (y su historial) se conserva. */
  @Put('coverage')
  @RequirePermissions(ZONES_MANAGE)
  async saveCoverage(@CurrentPrincipal() principal: Principal, @Body() body: CoverageDto) {
    return P.zone(await this.coverage.save(principal, body as Parameters<ManageCoverageUseCase['save']>[1]));
  }

  @Delete('coverage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ZONES_MANAGE)
  async removeCoverage(@CurrentPrincipal() principal: Principal, @Query() query: MunicipalityQueryDto) {
    await this.coverage.remove(principal, query.municipalityId);
  }

  /** Abrir o pausar un municipio, o mover el punto donde arranca su mapa (administrador general). */
  @Put('municipalities/:id')
  @RequirePermissions(MUNICIPALITIES_MANAGE)
  async updateMunicipality(@CurrentPrincipal() principal: Principal, @Param('id', ParseIntPipe) id: number, @Body() body: MunicipalityUpdateDto) {
    return P.municipality(await this.coverage.update(principal, id, body));
  }

  // ─────────────── Zonas y tarifas ───────────────

  @Get('zones')
  @RequirePermissions(ZONES_MANAGE)
  async listZones(@CurrentPrincipal() principal: Principal, @Query() query: MunicipalityQueryDto) {
    const { municipality, zones, coverage } = await this.zones.list(principal, query.municipalityId);
    return { municipality: P.municipality(municipality), zones: zones.map(P.zone), coverage: coverage && P.zone(coverage) };
  }

  @Post('zones')
  @RequirePermissions(ZONES_MANAGE)
  async createZone(@CurrentPrincipal() principal: Principal, @Body() body: ZoneDto) {
    return P.zone(await this.zones.create(principal, body));
  }

  /** Recorte de prueba: devuelve el anillo sin lo que ya cubren otras zonas (no guarda nada). */
  @Post('zones/trim')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(ZONES_MANAGE)
  async trimZone(@CurrentPrincipal() principal: Principal, @Body() body: TrimZoneDto) {
    return { area: await this.zones.trim(principal, body) };
  }

  @Put('zones/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ZONES_MANAGE)
  async reorderZones(@CurrentPrincipal() principal: Principal, @Body() body: ZoneOrderDto) {
    await this.zones.reorder(principal, body.municipalityId, body.ids);
  }

  /** Si cambia el polígono o el tipo, la respuesta trae otro id: la zona anterior queda dada de baja. */
  @Put('zones/:id')
  @RequirePermissions(ZONES_MANAGE)
  async updateZone(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: ZoneDto) {
    return P.zone(await this.zones.update(principal, id, body));
  }

  @Delete('zones/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ZONES_MANAGE)
  async deactivateZone(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    await this.zones.deactivate(principal, id);
  }

  @Get('zones/:id/fees')
  @RequirePermissions(ZONES_MANAGE)
  async zoneFees(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return (await this.zones.feeHistory(principal, id)).map((f) => ({ fee: f.fee, since: f.createdAt, by: f.createdBy }));
  }

  // ─────────────── Horario ───────────────

  @Get('schedule')
  @RequirePermissions(HOURS_MANAGE)
  async getSchedule(@CurrentPrincipal() principal: Principal, @Query() query: MunicipalityQueryDto) {
    return P.schedule(await this.schedule.get(principal, query.municipalityId));
  }

  @Put('schedule')
  @RequirePermissions(HOURS_MANAGE)
  async setWeekly(@CurrentPrincipal() principal: Principal, @Body() body: WeeklyScheduleDto) {
    return P.schedule(await this.schedule.setWeekly(principal, body.municipalityId, body.days));
  }

  @Put('schedule/exceptions/:date')
  @RequirePermissions(HOURS_MANAGE)
  async setException(@CurrentPrincipal() principal: Principal, @Param('date') date: string, @Body() body: ScheduleExceptionDto) {
    return P.schedule(await this.schedule.setException(principal, body.municipalityId, { date: DATE.test(date) ? date : '', ...body }));
  }

  @Delete('schedule/exceptions/:date')
  @RequirePermissions(HOURS_MANAGE)
  async removeException(@CurrentPrincipal() principal: Principal, @Param('date') date: string, @Query() query: MunicipalityQueryDto) {
    return P.schedule(await this.schedule.removeException(principal, query.municipalityId, DATE.test(date) ? date : ''));
  }

  // ─────────────── Parámetros y comisión ───────────────

  @Get('settings')
  @RequirePermissions(SETTINGS_MANAGE)
  async listSettings(@CurrentPrincipal() principal: Principal, @Query() query: MunicipalityQueryDto) {
    const { municipality, settings } = await this.settings.list(principal, query.municipalityId);
    return { municipality: P.municipality(municipality), canEditGlobal: principal.municipalityId === null, settings };
  }

  @Put('settings/:key')
  @RequirePermissions(SETTINGS_MANAGE)
  async changeSetting(@CurrentPrincipal() principal: Principal, @Param('key') key: string, @Body() body: SettingValueDto) {
    return this.settings.change(principal, { key, ...body });
  }

  @Get('settings/:key/history')
  @RequirePermissions(SETTINGS_MANAGE)
  async settingHistory(@CurrentPrincipal() principal: Principal, @Param('key') key: string, @Query() query: MunicipalityQueryDto) {
    return this.settings.history(principal, key, query.municipalityId);
  }

  @Get('commission')
  @RequirePermissions(COMMISSION_MANAGE)
  async getCommission(@CurrentPrincipal() principal: Principal, @Query() query: MunicipalityQueryDto) {
    return this.commissionView(await this.commission.get(principal, query.municipalityId));
  }

  @Put('commission')
  @RequirePermissions(COMMISSION_MANAGE)
  async changeCommission(@CurrentPrincipal() principal: Principal, @Body() body: CommissionDto) {
    return this.commissionView(await this.commission.change(principal, body));
  }

  // ─────────────── Tasas de cambio ───────────────

  @Get('exchange-rates')
  @RequirePermissions(SETTINGS_MANAGE)
  async exchangeRates() {
    return (await this.rates.current()).map(P.rate);
  }

  @Post('exchange-rates/refresh')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SETTINGS_MANAGE)
  async refreshRates() {
    return (await this.rates.refresh({ force: true })).map(P.rate);
  }

  private commissionView(view: Awaited<ReturnType<ManageCommissionUseCase['get']>>) {
    return {
      municipality: P.municipality(view.municipality),
      current: view.current ? P.commission(view.current) : null,
      history: view.history.map(P.commission),
    };
  }
}
