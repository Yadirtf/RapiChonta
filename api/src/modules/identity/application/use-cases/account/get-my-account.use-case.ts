import { Injectable } from '@nestjs/common';
import { IdentityErrors } from '../../../domain/identity.errors';
import { Principal } from '../../../domain/principal';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { LegalRepository } from '../../../domain/ports/legal.repository';
import { AccountView, toAccountView } from '../../services/account-view';

/** H01.5: Mi cuenta. */
@Injectable()
export class GetMyAccountUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly legal: LegalRepository,
  ) {}

  async execute(principal: Principal): Promise<AccountView> {
    const account = await this.accounts.findById(principal.userId);
    if (!account) throw IdentityErrors.userNotFound();
    return toAccountView(account, principal.role, principal.permissions, await this.legal.pendingFor(account.userId));
  }
}
