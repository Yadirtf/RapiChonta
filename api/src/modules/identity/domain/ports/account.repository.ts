import { RoleCode, UserStatusCode } from '../identity.codes';
import { PhoneNumber } from '../value-objects/phone-number';

export interface AccountRole {
  code: RoleCode;
  municipalityId: number | null;
  requiresPassword: boolean;
}

/** Vista de lectura de una cuenta: persona + acceso + roles vigentes. */
export interface Account {
  userId: string;
  personId: string;
  givenNames: string;
  familyNames: string | null;
  phone: PhoneNumber | null;
  status: UserStatusCode;
  canSignIn: boolean;
  passwordHash: string | null;
  roles: AccountRole[];
  language: string;
  /** Moneda del precio aproximado (H03.4): USD, EUR o null (solo pesos). */
  displayCurrency: string | null;
}

export interface NewCustomer {
  phone: PhoneNumber;
  givenNames: string;
  familyNames: string | null;
  language: string;
  acceptedLegalVersionIds: string[];
  ipAddress?: string;
}

export abstract class AccountRepository {
  abstract findByPhone(phone: PhoneNumber): Promise<Account | null>;
  abstract findById(userId: string): Promise<Account | null>;
  /** Registro del cliente en una transacción (Docs/14 E01, "Registro de un cliente"). Devuelve el userId. */
  abstract registerCustomer(customer: NewCustomer): Promise<string>;
  /** Otorga un rol que la persona puede tomar sola (is_self_assignable), p. ej. CUSTOMER. */
  abstract grantSelfAssignableRole(userId: string, role: RoleCode): Promise<void>;
  abstract markPhoneVerified(phone: PhoneNumber): Promise<void>;
  abstract updateNames(userId: string, givenNames: string, familyNames: string | null): Promise<void>;
  abstract setLanguage(userId: string, language: string): Promise<void>;
  abstract setDisplayCurrency(userId: string, currency: string | null): Promise<void>;
  abstract replacePrimaryPhone(userId: string, phone: PhoneNumber): Promise<void>;
  abstract setPasswordHash(userId: string, passwordHash: string): Promise<void>;
  /** Cambia el estado por el historial; si el estado nuevo no permite entrar, cierra las sesiones abiertas. */
  abstract changeStatus(input: {
    userId: string;
    to: UserStatusCode;
    changedByUserId: string | null;
    reason?: string;
  }): Promise<void>;
  /** Documento de identidad ya registrado en otra persona. */
  abstract documentInUse(documentType: string, documentNumber: string, exceptPersonId?: string): Promise<boolean>;
  /** Solicitud de eliminación del titular: registra la solicitud y anonimiza en una transacción (H01.5). */
  abstract deletePersonalData(userId: string): Promise<void>;
}
