import { Injectable } from '@nestjs/common';
import { LanguageCode } from '../../../domain/identity.codes';
import { Principal } from '../../../domain/principal';
import { AccountRepository } from '../../../domain/ports/account.repository';

/** H01.5 / RNF-03: el idioma se recuerda en la cuenta (user_preferences) y se usa en avisos y SMS. */
@Injectable()
export class SetMyLanguageUseCase {
  constructor(private readonly accounts: AccountRepository) {}

  execute(principal: Principal, language: LanguageCode): Promise<void> {
    return this.accounts.setLanguage(principal.userId, language);
  }
}
