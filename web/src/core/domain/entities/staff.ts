import type { RoleCode, UserStatusCode } from "./account";

export type CourierVerificationCode = "PENDING" | "VERIFIED" | "SUSPENDED" | "REJECTED";

/** Cambios de verificación permitidos (courier_verification_transitions). La API es la que decide. */
export const VERIFICATION_TRANSITIONS: Record<CourierVerificationCode, CourierVerificationCode[]> = {
  PENDING: ["VERIFIED", "REJECTED"],
  VERIFIED: ["SUSPENDED"],
  SUSPENDED: ["VERIFIED"],
  REJECTED: ["PENDING"],
};

/** Cambios de estado de cuenta que el panel ofrece (user_status_transitions, sin CLOSED). */
export const ACCOUNT_TRANSITIONS: Partial<Record<UserStatusCode, UserStatusCode[]>> = {
  ACTIVE: ["SUSPENDED", "DEACTIVATED"],
  SUSPENDED: ["ACTIVE", "DEACTIVATED"],
  DEACTIVATED: ["ACTIVE"],
};

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
  createdAt: string;
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
  verificationHistory: { from: string | null; to: string; reason: string | null; changedAt: string; changedBy: string | null }[];
}

export interface StaffMember {
  userId: string;
  givenNames: string;
  familyNames: string | null;
  phone: string | null;
  roles: { code: RoleCode; municipality: string | null }[];
  accountStatus: UserStatusCode;
  lastSignInAt: string | null;
  createdAt: string;
}

/** Catálogos vigentes para los formularios del panel. */
export interface IdentityOptions {
  documentTypes: string[];
  vehicleTypes: { code: string; requiresPlate: boolean }[];
  fundingModes: string[];
  paymentMethods: { code: string; requiresBank: boolean }[];
  banks: { code: string; name: string }[];
  bankAccountTypes: string[];
  municipalities: { id: number; name: string }[];
}

export interface PersonInput {
  givenNames: string;
  familyNames: string;
  documentType: string;
  documentNumber: string;
  phone: string;
  password: string;
}

export interface NewCourier extends PersonInput {
  municipalityId: number;
  fundingMode: string;
  vehicle: { type: string; plate?: string; description?: string };
  collectionAccounts: {
    paymentMethod: string;
    accountNumber: string;
    holderName: string;
    bank?: string;
    bankAccountType?: string;
  }[];
}

export interface NewStaffMember extends PersonInput {
  role: Extract<RoleCode, "OPERATOR" | "ADMIN">;
  municipalityId?: number;
}
