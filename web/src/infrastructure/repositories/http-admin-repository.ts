import type { UserStatusCode } from "@/core/domain/entities/account";
import type {
  CourierDetail,
  CourierSummary,
  CourierVerificationCode,
  IdentityOptions,
  NewCourier,
  NewStaffMember,
  StaffMember,
} from "@/core/domain/entities/staff";
import type { AdminRepository } from "@/core/domain/repositories/admin-repository";
import { apiRequest } from "../http/api-client";

export class HttpAdminRepository implements AdminRepository {
  options() {
    return apiRequest<IdentityOptions>("GET", "/admin/identity/options");
  }

  couriers(filter: { status?: CourierVerificationCode; q?: string }) {
    return apiRequest<CourierSummary[]>("GET", "/admin/couriers", { query: filter });
  }

  courier(userId: string) {
    return apiRequest<CourierDetail>("GET", `/admin/couriers/${encodeURIComponent(userId)}`);
  }

  createCourier(input: NewCourier) {
    return apiRequest<CourierDetail>("POST", "/admin/couriers", { body: input });
  }

  changeVerification(userId: string, status: CourierVerificationCode, reason?: string) {
    return apiRequest<CourierDetail>("POST", `/admin/couriers/${encodeURIComponent(userId)}/verification`, {
      body: { status, reason: reason || undefined },
    });
  }

  changeCourierMunicipality(userId: string, municipalityId: number) {
    return apiRequest<CourierDetail>("POST", `/admin/couriers/${encodeURIComponent(userId)}/municipality`, { body: { municipalityId } });
  }

  changeUserStatus(userId: string, status: UserStatusCode, reason?: string) {
    return apiRequest<void>("POST", `/admin/users/${encodeURIComponent(userId)}/status`, { body: { status, reason: reason || undefined } });
  }

  staff() {
    return apiRequest<StaffMember[]>("GET", "/admin/staff");
  }

  async createStaff(input: NewStaffMember) {
    await apiRequest<{ userId: string }>("POST", "/admin/staff", { body: input });
  }
}
