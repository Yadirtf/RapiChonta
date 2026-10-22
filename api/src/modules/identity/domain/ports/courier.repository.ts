import { CourierVerificationCode, UserStatusCode } from '../identity.codes';
import { PhoneNumber } from '../value-objects/phone-number';

export interface PersonIdentity {
  givenNames: string;
  familyNames: string;
  documentType: string;
  documentNumber: string;
  phone: PhoneNumber;
}

export interface NewCollectionAccount {
  paymentMethod: string;
  accountNumber: string;
  holderName: string;
  bank?: string;
  bankAccountType?: string;
}

export interface NewCourier extends PersonIdentity {
  passwordHash: string;
  municipalityId: number;
  fundingMode: string;
  vehicle: { type: string; plate?: string; description?: string };
  collectionAccounts: NewCollectionAccount[];
  createdByUserId: string;
  /** Si el número ya es de un cliente, se le agrega el rol COURIER en vez de crear otra cuenta. */
  existingUserId?: string;
}

export interface CourierSummary {
  userId: string;
  givenNames: string;
  familyNames: string | null;
  phone: string | null;
  documentType: string | null;
  documentNumber: string | null;
  verificationStatus: CourierVerificationCode;
  accountStatus: UserStatusCode;
  municipality: { id: number; name: string } | null;
  fundingMode: string | null;
  vehicle: { type: string; plate: string | null } | null;
  createdAt: Date;
}

export interface CourierDetail extends CourierSummary {
  vehicleDescription: string | null;
  collectionAccounts: {
    id: string;
    paymentMethod: string;
    bank: string | null;
    bankAccountType: string | null;
    accountNumber: string;
    holderName: string;
  }[];
  verificationHistory: { from: string | null; to: string; reason: string | null; changedAt: Date; changedBy: string | null }[];
}

/** Resultado de cambiar el municipio del domiciliario. */
export type MunicipalityChange = 'CHANGED' | 'NOT_FOUND' | 'SAME' | 'HAS_ACTIVE_ORDER';

export abstract class CourierRepository {
  abstract create(courier: NewCourier): Promise<string>;
  abstract list(filter: { verificationStatus?: CourierVerificationCode; search?: string }): Promise<CourierSummary[]>;
  abstract findById(userId: string): Promise<CourierDetail | null>;
  abstract currentVerification(userId: string): Promise<CourierVerificationCode | null>;
  /**
   * Mueve el rol COURIER a otro municipio: revoca el vigente y otorga uno nuevo (queda el historial en
   * user_roles). Con un pedido en curso no se mueve: ese pedido es del municipio anterior.
   */
  abstract changeMunicipality(input: { userId: string; municipalityId: number; changedByUserId: string }): Promise<MunicipalityChange>;
  abstract isTransitionAllowed(from: CourierVerificationCode, to: CourierVerificationCode): Promise<boolean>;
  abstract changeVerification(input: {
    userId: string;
    from: CourierVerificationCode;
    to: CourierVerificationCode;
    changedByUserId: string;
    reason?: string;
  }): Promise<void>;
}
