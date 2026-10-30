import { Injectable } from '@nestjs/common';
import { ROLES, RoleCode } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { Principal } from '../../../domain/principal';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { IdentityOptionsRepository } from '../../../domain/ports/identity-options.repository';
import { PasswordHasher } from '../../../domain/ports/password-hasher.port';
import { StaffMember, StaffRepository } from '../../../domain/ports/staff.repository';
import { Password } from '../../../domain/value-objects/password';
import { PersonInput, resolvePerson } from './person-input';

export interface CreateStaffInput extends PersonInput {
  password: string;
  role: RoleCode;
  municipalityId?: number;
}

/**
 * H01.4: el administrador crea operadores (con su municipio) y otros administradores (globales). Desde E15 también la
 * cuenta de quien atiende un comercio aliado (MERCHANT, sin municipio): la crea el módulo merchants al darle acceso.
 */
@Injectable()
export class CreateStaffMemberUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly staff: StaffRepository,
    private readonly options: IdentityOptionsRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(principal: Principal, input: CreateStaffInput): Promise<string> {
    if (input.role !== ROLES.OPERATOR && input.role !== ROLES.ADMIN && input.role !== ROLES.MERCHANT) throw IdentityErrors.invalidOption('role');
    const password = Password.create(input.password);

    const options = await this.options.load();
    if (!options.documentTypes.includes(input.documentType)) throw IdentityErrors.invalidOption('documentType');
    const municipalityId = input.role === ROLES.OPERATOR ? input.municipalityId : undefined;
    if (input.role === ROLES.OPERATOR) {
      if (!municipalityId) throw IdentityErrors.municipalityRequired();
      if (!options.municipalities.some((m) => m.id === municipalityId)) throw IdentityErrors.invalidOption('municipalityId');
    }

    const { phone, existing, documentNumber } = await resolvePerson(input, input.role, this.accounts);
    return this.staff.create({
      givenNames: input.givenNames.trim(),
      familyNames: input.familyNames.trim(),
      documentType: input.documentType,
      documentNumber,
      phone,
      passwordHash: await this.hasher.hash(password.value),
      role: input.role,
      municipalityId: municipalityId ?? null,
      createdByUserId: principal.userId,
      existingUserId: existing?.userId,
    });
  }
}

@Injectable()
export class ListStaffUseCase {
  constructor(private readonly staff: StaffRepository) {}

  execute(): Promise<StaffMember[]> {
    return this.staff.list();
  }
}
