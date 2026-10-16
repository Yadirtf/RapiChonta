import { Injectable } from '@nestjs/common';
import { ROLES } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { AccountRepository } from '../../../domain/ports/account.repository';
import { LegalRepository } from '../../../domain/ports/legal.repository';
import { DeviceInfo } from '../../../domain/ports/session.repository';
import { TokenService } from '../../../domain/ports/token.port';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { SignedIn, SignInFinisher } from '../../services/signed-in';

/** H01.1 + RF-07: primer ingreso del cliente con su nombre y la aceptación de los documentos vigentes. */
@Injectable()
export class RegisterCustomerUseCase {
  constructor(
    private readonly tokens: TokenService,
    private readonly accounts: AccountRepository,
    private readonly legal: LegalRepository,
    private readonly finisher: SignInFinisher,
  ) {}

  async execute(input: {
    registrationToken: string;
    givenNames: string;
    familyNames?: string;
    acceptedLegalVersionIds: string[];
    language: string;
    device?: DeviceInfo;
    ipAddress?: string;
  }): Promise<SignedIn> {
    const ticket = await this.tokens.verifyRegistrationTicket(input.registrationToken);
    if (!ticket) throw IdentityErrors.registrationExpired();
    const phone = PhoneNumber.fromTrusted(ticket.phoneE164);

    if (await this.accounts.findByPhone(phone)) throw IdentityErrors.phoneAlreadyRegistered();

    const required = await this.legal.currentRequiredFor([ROLES.CUSTOMER]);
    const accepted = new Set(input.acceptedLegalVersionIds);
    const missing = required.filter((doc) => !accepted.has(doc.id));
    if (missing.length) throw IdentityErrors.consentRequired(missing.map((doc) => doc.documentType));

    const userId = await this.accounts.registerCustomer({
      phone,
      givenNames: input.givenNames.trim(),
      familyNames: input.familyNames?.trim() || null,
      language: input.language,
      acceptedLegalVersionIds: required.map((doc) => doc.id),
      ipAddress: input.ipAddress,
    });
    const account = await this.accounts.findById(userId);
    if (!account) throw IdentityErrors.userNotFound();
    return this.finisher.finish(account, ROLES.CUSTOMER, input.device);
  }
}
