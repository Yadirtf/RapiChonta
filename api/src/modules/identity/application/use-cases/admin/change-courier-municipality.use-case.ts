import { Injectable } from '@nestjs/common';
import { IdentityErrors } from '../../../domain/identity.errors';
import { Principal } from '../../../domain/principal';
import { CourierRepository } from '../../../domain/ports/courier.repository';
import { IdentityOptionsRepository } from '../../../domain/ports/identity-options.repository';

/**
 * Corrige el municipio del domiciliario (el panel de despacho de cada municipio solo ve a los suyos). Quien
 * tiene alcance de municipio no puede mandarlo a otro. Con un pedido en curso se espera a que lo termine.
 */
@Injectable()
export class ChangeCourierMunicipalityUseCase {
  constructor(
    private readonly couriers: CourierRepository,
    private readonly options: IdentityOptionsRepository,
  ) {}

  async execute(principal: Principal, input: { userId: string; municipalityId: number }): Promise<void> {
    if (principal.municipalityId !== null && principal.municipalityId !== input.municipalityId) throw IdentityErrors.municipalityOutOfScope();
    const { municipalities } = await this.options.load();
    if (!municipalities.some((m) => m.id === input.municipalityId)) throw IdentityErrors.invalidOption('municipalityId');
    const result = await this.couriers.changeMunicipality({ ...input, changedByUserId: principal.userId });
    if (result === 'NOT_FOUND') throw IdentityErrors.courierNotFound();
    if (result === 'HAS_ACTIVE_ORDER') throw IdentityErrors.courierBusyElsewhere();
  }
}
