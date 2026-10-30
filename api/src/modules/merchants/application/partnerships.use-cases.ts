import { Injectable } from '@nestjs/common';
import { CreateStaffMemberUseCase } from '../../identity/application/use-cases/admin/create-staff-member.use-case';
import { ROLES } from '../../identity/domain/identity.codes';
import { Principal } from '../../identity/domain/principal';
import { PhoneNumber } from '../../identity/domain/value-objects/phone-number';
import { MerchantErrors } from '../domain/merchants.errors';
import { PartnershipRefusal, Partnerships } from '../domain/ports/partnerships';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface NewMemberInput {
  phone: string;
  givenNames?: string;
  familyNames?: string;
  documentType?: string;
  documentNumber?: string;
  password?: string;
}

function refusal(reason: PartnershipRefusal): Error {
  switch (reason) {
    case 'ACTIVE':
      return MerchantErrors.partnershipActive();
    case 'NONE':
      return MerchantErrors.partnershipNotFound();
    case 'DATES':
      return MerchantErrors.partnershipDatesInvalid();
    case 'FILE':
      return MerchantErrors.agreementNotUsable();
    case 'STAFF_EXISTS':
      return MerchantErrors.staffExists();
    case 'STAFF_NOT_FOUND':
      return MerchantErrors.staffNotFound();
    case 'NO_PARTNERSHIP':
      return MerchantErrors.partnershipRequired();
    default:
      return MerchantErrors.establishmentNotFound();
  }
}

/**
 * H15.1 desde el panel: el administrador firma el convenio con el comercio (desde qué día, con la foto del contrato)
 * y le da acceso al portal a quien lo atiende. Mientras no haya convenio vigente, el local sigue siendo de compra por
 * RapiChonta y el portal está cerrado.
 */
@Injectable()
export class ManagePartnershipsUseCase {
  constructor(
    private readonly partnerships: Partnerships,
    private readonly createStaff: CreateStaffMemberUseCase,
  ) {}

  async view(establishmentId: string) {
    const view = await this.partnerships.view(establishmentId);
    if (!view) throw MerchantErrors.establishmentNotFound();
    return view;
  }

  async start(principal: Principal, establishmentId: string, input: { startedOn?: string; endedOn?: string | null; agreementFileId?: string | null }) {
    const { establishment } = await this.view(establishmentId);
    const startedOn = input.startedOn ?? establishment.today;
    const endedOn = input.endedOn ?? null;
    // No se firma con fecha pasada: el convenio rige desde hoy (o desde el día acordado) en adelante.
    if (!DATE.test(startedOn) || startedOn < establishment.today || (endedOn !== null && (!DATE.test(endedOn) || endedOn <= startedOn))) {
      throw MerchantErrors.partnershipDatesInvalid();
    }
    await this.check(
      this.partnerships.start({ establishmentId, startedOn, endedOn, agreementFileId: input.agreementFileId ?? null, actorUserId: principal.userId }),
    );
    return this.view(establishmentId);
  }

  async end(principal: Principal, establishmentId: string, input: { endedOn?: string }) {
    const { establishment } = await this.view(establishmentId);
    const endedOn = input.endedOn ?? establishment.today;
    if (!DATE.test(endedOn) || endedOn < establishment.today) throw MerchantErrors.partnershipDatesInvalid();
    await this.check(this.partnerships.end({ establishmentId, endedOn, actorUserId: principal.userId }));
    return this.view(establishmentId);
  }

  /**
   * Da acceso al portal. Si el número ya es de alguien del comercio (atiende otro local), se reutiliza su cuenta; si
   * no, se crea con sus datos y contraseña (o se promueve la de cliente, como al crear personal).
   */
  async addMember(principal: Principal, establishmentId: string, input: NewMemberInput) {
    const view = await this.view(establishmentId);
    if (!view.current && !view.upcoming) throw MerchantErrors.partnershipRequired();
    const phone = PhoneNumber.parse(input.phone);
    let userId = (await this.partnerships.merchantByPhone(phone.e164))?.userId;
    if (!userId) {
      const { givenNames, familyNames, documentType, documentNumber, password } = input;
      if (!givenNames || !familyNames || !documentType || !documentNumber || !password) throw MerchantErrors.personRequired();
      userId = await this.createStaff.execute(principal, { givenNames, familyNames, documentType, documentNumber, password, phone: input.phone, role: ROLES.MERCHANT });
    }
    await this.check(this.partnerships.addMember({ establishmentId, userId, actorUserId: principal.userId }));
    return this.view(establishmentId);
  }

  async revokeMember(principal: Principal, establishmentId: string, staffId: string) {
    await this.check(this.partnerships.revokeMember({ establishmentId, staffId, actorUserId: principal.userId }));
    return this.view(establishmentId);
  }

  private async check(result: Promise<PartnershipRefusal | null>) {
    const reason = await result;
    if (reason) throw refusal(reason);
  }
}
