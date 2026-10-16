import { Injectable } from '@nestjs/common';
import { CourierVerificationCode } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { Principal } from '../../../domain/principal';
import { CourierRepository } from '../../../domain/ports/courier.repository';

/**
 * H01.3: verificar, rechazar o suspender al domiciliario. Las transiciones permitidas viven en
 * courier_verification_transitions; el historial guarda quién, cuándo y por qué.
 */
@Injectable()
export class ChangeCourierVerificationUseCase {
  constructor(private readonly couriers: CourierRepository) {}

  async execute(principal: Principal, input: { userId: string; to: CourierVerificationCode; reason?: string }): Promise<void> {
    const from = await this.couriers.currentVerification(input.userId);
    if (!from) throw IdentityErrors.courierNotFound();
    if (from === input.to || !(await this.couriers.isTransitionAllowed(from, input.to))) throw IdentityErrors.invalidTransition();
    await this.couriers.changeVerification({
      userId: input.userId,
      from,
      to: input.to,
      changedByUserId: principal.userId,
      reason: input.reason?.trim() || undefined,
    });
  }
}
