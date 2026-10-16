import { Injectable } from '@nestjs/common';
import { PERMISSIONS, ROLES, USER_STATUSES, UserStatusCode } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { Principal } from '../../../domain/principal';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { StaffRepository } from '../../../domain/ports/staff.repository';

/**
 * H01.3 y H01.4: el administrador suspende, desactiva o reactiva una cuenta. Las sesiones de una cuenta que
 * ya no puede entrar se cierran en la misma transacción. El permiso depende de a quién se cambia:
 * personal → users.manage_staff; domiciliario → couriers.manage.
 */
@Injectable()
export class ChangeUserStatusUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly staff: StaffRepository,
  ) {}

  async execute(principal: Principal, input: { userId: string; to: UserStatusCode; reason?: string }): Promise<void> {
    if (input.userId === principal.userId) throw IdentityErrors.cannotChangeOwnStatus();
    if (input.to === USER_STATUSES.CLOSED) throw IdentityErrors.invalidTransition();

    const account = await this.accounts.findById(input.userId);
    if (!account) throw IdentityErrors.userNotFound();

    const isStaff = account.roles.some((r) => r.code === ROLES.OPERATOR || r.code === ROLES.ADMIN);
    const isCourier = account.roles.some((r) => r.code === ROLES.COURIER);
    const required = isStaff || !isCourier ? PERMISSIONS.USERS_MANAGE_STAFF : PERMISSIONS.COURIERS_MANAGE;
    // 404 y no 403: quien no administra esa clase de cuentas no debe saber que existe.
    if (!principal.permissions.has(required)) throw IdentityErrors.userNotFound();

    if (account.status === input.to || !(await this.staff.isUserStatusTransitionAllowed(account.status, input.to))) {
      throw IdentityErrors.invalidTransition();
    }
    await this.accounts.changeStatus({
      userId: account.userId,
      to: input.to,
      changedByUserId: principal.userId,
      reason: input.reason?.trim() || undefined,
    });
  }
}
