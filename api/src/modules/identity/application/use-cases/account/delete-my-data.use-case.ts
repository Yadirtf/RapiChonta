import { Injectable } from '@nestjs/common';
import { Principal } from '../../../domain/principal';
import { AccountRepository } from '../../../domain/ports/account.repository';

/**
 * H01.5 / Ley 1581: la solicitud de eliminación anonimiza los datos personales y cierra la cuenta,
 * conservando los pedidos y movimientos que exige la contabilidad (anonymize_person en la base de datos).
 */
@Injectable()
export class DeleteMyDataUseCase {
  constructor(private readonly accounts: AccountRepository) {}

  execute(principal: Principal): Promise<void> {
    return this.accounts.deletePersonalData(principal.userId);
  }
}
