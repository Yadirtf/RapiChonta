import { Injectable } from '@nestjs/common';
import { ROLES } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { Principal } from '../../../domain/principal';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { CourierRepository, NewCollectionAccount } from '../../../domain/ports/courier.repository';
import { IdentityOptionsRepository } from '../../../domain/ports/identity-options.repository';
import { PasswordHasher } from '../../../domain/ports/password-hasher.port';
import { Password } from '../../../domain/value-objects/password';
import { PersonInput, resolvePerson } from './person-input';

export interface CreateCourierInput extends PersonInput {
  password: string;
  municipalityId: number;
  fundingMode: string;
  vehicle: { type: string; plate?: string; description?: string };
  collectionAccounts: NewCollectionAccount[];
}

/**
 * H01.3 / RF-04: solo el administrador crea domiciliarios (no hay registro abierto ni endpoint para que un
 * cliente se vuelva domiciliario). Queda en PENDING: no recibe ofertas hasta que se verifique.
 */
@Injectable()
export class CreateCourierUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly couriers: CourierRepository,
    private readonly options: IdentityOptionsRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(principal: Principal, input: CreateCourierInput): Promise<string> {
    const password = Password.create(input.password);
    await this.validateOptions(input);
    const { phone, existing, documentNumber } = await resolvePerson(input, ROLES.COURIER, this.accounts);

    return this.couriers.create({
      givenNames: input.givenNames.trim(),
      familyNames: input.familyNames.trim(),
      documentType: input.documentType,
      documentNumber,
      phone,
      passwordHash: await this.hasher.hash(password.value),
      municipalityId: input.municipalityId,
      fundingMode: input.fundingMode,
      vehicle: {
        type: input.vehicle.type,
        plate: input.vehicle.plate?.replace(/[\s-]/g, '').toUpperCase() || undefined,
        description: input.vehicle.description?.trim() || undefined,
      },
      collectionAccounts: input.collectionAccounts.map((account) => ({
        ...account,
        accountNumber: account.accountNumber.replace(/[\s-]/g, ''),
        holderName: account.holderName.trim(),
      })),
      createdByUserId: principal.userId,
      existingUserId: existing?.userId,
    });
  }

  /** Mensajes claros antes de que la base de datos rechace la fila (los disparadores son la última defensa). */
  private async validateOptions(input: CreateCourierInput): Promise<void> {
    const options = await this.options.load();
    if (!options.documentTypes.includes(input.documentType)) throw IdentityErrors.invalidOption('documentType');
    if (!options.fundingModes.includes(input.fundingMode)) throw IdentityErrors.invalidOption('fundingMode');
    if (!options.municipalities.some((m) => m.id === input.municipalityId)) throw IdentityErrors.invalidOption('municipalityId');

    const vehicleType = options.vehicleTypes.find((v) => v.code === input.vehicle.type);
    if (!vehicleType) throw IdentityErrors.invalidOption('vehicle.type');
    if (vehicleType.requiresPlate && !input.vehicle.plate?.trim()) throw IdentityErrors.invalidOption('vehicle.plate');

    const seen = new Set<string>();
    for (const account of input.collectionAccounts) {
      const method = options.paymentMethods.find((m) => m.code === account.paymentMethod);
      if (!method || seen.has(method.code)) throw IdentityErrors.invalidOption('collectionAccounts.paymentMethod');
      seen.add(method.code);
      if (method.requiresBank) {
        if (!options.banks.some((b) => b.code === account.bank)) throw IdentityErrors.invalidOption('collectionAccounts.bank');
        if (!options.bankAccountTypes.includes(account.bankAccountType ?? '')) {
          throw IdentityErrors.invalidOption('collectionAccounts.bankAccountType');
        }
      } else if (account.bank || account.bankAccountType) {
        throw IdentityErrors.invalidOption('collectionAccounts.bank');
      }
    }
  }
}
