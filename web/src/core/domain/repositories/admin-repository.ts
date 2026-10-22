import type { UserStatusCode } from "../entities/account";
import type {
  CourierDetail,
  CourierSummary,
  CourierVerificationCode,
  IdentityOptions,
  NewCourier,
  NewStaffMember,
  StaffMember,
} from "../entities/staff";

/** Panel del administrador (H01.3, H01.4). */
export interface AdminRepository {
  options(): Promise<IdentityOptions>;
  couriers(filter: { status?: CourierVerificationCode; q?: string }): Promise<CourierSummary[]>;
  courier(userId: string): Promise<CourierDetail>;
  createCourier(input: NewCourier): Promise<CourierDetail>;
  changeVerification(userId: string, status: CourierVerificationCode, reason?: string): Promise<CourierDetail>;
  changeCourierMunicipality(userId: string, municipalityId: number): Promise<CourierDetail>;
  changeUserStatus(userId: string, status: UserStatusCode, reason?: string): Promise<void>;
  staff(): Promise<StaffMember[]>;
  createStaff(input: NewStaffMember): Promise<void>;
}
