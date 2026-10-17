import { Injectable } from '@nestjs/common';
import { SettingsReader } from '../../../shared/infrastructure/settings/settings.reader';
import { Principal } from '../../identity/domain/principal';
import { BusinessErrors } from '../domain/business-config.errors';
import { SettingsRepository } from '../domain/ports/settings.repository';
import { CommissionPercent, parseSettingValue, trimDecimal } from '../domain/value-objects/business-values';
import { MunicipalityScope } from './municipality-scope';

const HISTORY_LIMIT = 20;

/**
 * Parámetros del negocio en el panel (H03.3, RF-16). Cada cambio es una versión nueva de setting_values
 * (quién y cuándo) más un registro de auditoría; nada se sobrescribe.
 */
@Injectable()
export class ManageSettingsUseCase {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly scope: MunicipalityScope,
    private readonly reader: SettingsReader,
  ) {}

  async list(principal: Principal, municipalityId?: number) {
    const municipality = await this.scope.resolve(principal, municipalityId);
    return { municipality, settings: await this.settings.list(municipality.id) };
  }

  /**
   * `scope`: GLOBAL cambia el valor de todos los municipios que no tengan uno propio; MUNICIPALITY, solo el
   * del municipio. El personal con alcance de municipio solo puede cambiar el de su municipio.
   */
  async change(principal: Principal, input: { key: string; value: string | number; scope: 'GLOBAL' | 'MUNICIPALITY'; municipalityId?: number }) {
    const municipality = await this.scope.resolve(principal, input.municipalityId);
    const target = input.scope === 'GLOBAL' && principal.municipalityId === null ? null : municipality.id;
    const setting = await this.settings.find(input.key, municipality.id);
    if (!setting) throw BusinessErrors.settingNotFound();
    if (target !== null && !setting.scoped) throw BusinessErrors.settingNotScoped();

    const value = parseSettingValue(setting.type, input.value, setting.min, setting.max);
    const previous = (target === null ? setting.global : setting.municipal)?.value ?? null;
    if (previous === null || trimDecimal(previous) !== value) {
      await this.settings.insert({ key: setting.key, municipalityId: target, value, previous: previous && trimDecimal(previous), actorUserId: principal.userId });
      this.reader.invalidate();
    }
    return (await this.settings.find(setting.key, municipality.id))!;
  }

  async history(principal: Principal, key: string, municipalityId?: number) {
    const municipality = await this.scope.resolve(principal, municipalityId);
    if (!(await this.settings.find(key, municipality.id))) throw BusinessErrors.settingNotFound();
    return this.settings.history(key, municipality.id, HISTORY_LIMIT);
  }
}

/**
 * Comisión por municipio (RF-73). El pedido (E04) apunta a la versión vigente con commission_rate_id:
 * un cambio aquí solo afecta los pedidos que se creen después.
 */
@Injectable()
export class ManageCommissionUseCase {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly scope: MunicipalityScope,
  ) {}

  async get(principal: Principal, municipalityId?: number) {
    const municipality = await this.scope.resolve(principal, municipalityId);
    const history = await this.settings.commissionHistory(municipality.id, HISTORY_LIMIT);
    return { municipality, current: history[0] ?? null, history };
  }

  async change(principal: Principal, input: { percent: string | number; municipalityId?: number }) {
    const municipality = await this.scope.resolve(principal, input.municipalityId);
    const percent = CommissionPercent.parse(input.percent);
    const [current] = await this.settings.commissionHistory(municipality.id, 1);
    if (!current || !CommissionPercent.fromRate(current.rate).equals(percent)) {
      await this.settings.insertCommission({ municipalityId: municipality.id, rate: percent.toRate(), previous: current?.rate ?? null, actorUserId: principal.userId });
    }
    return this.get(principal, municipality.id);
  }
}
