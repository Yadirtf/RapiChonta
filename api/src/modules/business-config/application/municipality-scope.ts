import { Injectable } from '@nestjs/common';
import { Principal } from '../../identity/domain/principal';
import { BusinessErrors } from '../domain/business-config.errors';
import { MunicipalityDirectory, MunicipalityInfo } from '../domain/ports/municipalities';

/**
 * Municipio sobre el que actúa el personal. El que tiene alcance (operador, administrador de un municipio)
 * solo ve el suyo; el administrador global elige, y mientras solo opere Villagarzón no tiene que hacerlo.
 */
@Injectable()
export class MunicipalityScope {
  constructor(private readonly municipalities: MunicipalityDirectory) {}

  async resolve(principal: Principal | null, requested?: number): Promise<MunicipalityInfo> {
    const scoped = principal?.municipalityId ?? null;
    if (scoped !== null && requested !== undefined && requested !== scoped) throw BusinessErrors.municipalityNotFound();
    const id = scoped ?? requested ?? (await this.soleLaunched());
    if (id === undefined) throw BusinessErrors.municipalityRequired();
    const municipality = await this.municipalities.find(id);
    if (!municipality) throw BusinessErrors.municipalityNotFound();
    return municipality;
  }

  list(principal: Principal) {
    return this.municipalities.list(principal.municipalityId);
  }

  private async soleLaunched(): Promise<number | undefined> {
    const launched = (await this.municipalities.list(null)).filter((m) => m.launched);
    return launched.length === 1 ? launched[0].id : undefined;
  }
}
