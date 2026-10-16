import { RoleCode, UserStatusCode } from '../identity.codes';
import { PersonIdentity } from './courier.repository';

export interface NewStaffMember extends PersonIdentity {
  passwordHash: string;
  role: RoleCode;
  municipalityId: number | null;
  createdByUserId: string;
  existingUserId?: string;
}

export interface StaffMember {
  userId: string;
  givenNames: string;
  familyNames: string | null;
  phone: string | null;
  roles: { code: RoleCode; municipality: string | null }[];
  accountStatus: UserStatusCode;
  lastSignInAt: Date | null;
  createdAt: Date;
}

export abstract class StaffRepository {
  abstract create(member: NewStaffMember): Promise<string>;
  abstract list(): Promise<StaffMember[]>;
  abstract isUserStatusTransitionAllowed(from: UserStatusCode, to: UserStatusCode): Promise<boolean>;
}
