import { Injectable } from '@nestjs/common';
import { RoleCode } from '../../domain/identity.codes';
import { Account } from '../../domain/ports/account.repository';
import { LegalRepository } from '../../domain/ports/legal.repository';
import { RolePermissions } from '../../domain/ports/role-permissions.port';
import { DeviceInfo } from '../../domain/ports/session.repository';
import { AccountView, toAccountView } from './account-view';
import { IssuedSession, SessionIssuer } from './session-issuer';

export interface SignedIn {
  status: 'SIGNED_IN';
  session: IssuedSession;
  account: AccountView;
}

/** Último paso común de todos los ingresos: abre la sesión y arma la vista de la cuenta. */
@Injectable()
export class SignInFinisher {
  constructor(
    private readonly issuer: SessionIssuer,
    private readonly legal: LegalRepository,
    private readonly permissions: RolePermissions,
  ) {}

  async finish(account: Account, role: RoleCode, device?: DeviceInfo): Promise<SignedIn> {
    const session = await this.issuer.open(account.userId, role, device);
    const pending = await this.legal.pendingFor(account.userId);
    return {
      status: 'SIGNED_IN',
      session,
      account: toAccountView(account, role, this.permissions.permissionsOf(role), pending),
    };
  }
}
