import { Injectable } from '@nestjs/common';
import { AUTH_FACTORS } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { Principal } from '../../../domain/principal';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { OtpChallengeRepository } from '../../../domain/ports/otp-challenge.repository';
import { PasswordHasher } from '../../../domain/ports/password-hasher.port';
import { Password } from '../../../domain/value-objects/password';

/** El personal y los domiciliarios cambian la contraseña que les asignó el administrador. */
@Injectable()
export class ChangeMyPasswordUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly challenges: OtpChallengeRepository,
  ) {}

  async execute(principal: Principal, input: { currentPassword: string; newPassword: string; ipAddress?: string }): Promise<void> {
    const account = await this.accounts.findById(principal.userId);
    if (!account) throw IdentityErrors.userNotFound();
    if (!account.passwordHash) throw IdentityErrors.noPassword();

    const valid = await this.hasher.verify(account.passwordHash, input.currentPassword);
    await this.challenges.recordAttempt({
      factor: AUTH_FACTORS.PASSWORD,
      userId: account.userId,
      succeeded: valid,
      ipAddress: input.ipAddress,
    });
    if (!valid) throw IdentityErrors.invalidCredentials();

    const next = Password.create(input.newPassword);
    await this.accounts.setPasswordHash(account.userId, await this.hasher.hash(next.value));
  }
}
