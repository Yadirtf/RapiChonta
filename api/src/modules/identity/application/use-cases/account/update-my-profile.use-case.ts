import { Injectable } from '@nestjs/common';
import { Principal } from '../../../domain/principal';
import { AccountRepository } from '../../../domain/ports/account.repository';

/** H01.5: corregir el nombre. */
@Injectable()
export class UpdateMyProfileUseCase {
  constructor(private readonly accounts: AccountRepository) {}

  execute(principal: Principal, input: { givenNames: string; familyNames?: string | null }): Promise<void> {
    return this.accounts.updateNames(principal.userId, input.givenNames.trim(), input.familyNames?.trim() || null);
  }
}
