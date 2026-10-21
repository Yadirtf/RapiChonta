import type { DispatchBoardSnapshot, DispatchCourier, StaffActivityPage } from "@/core/domain/entities/dispatch";
import type { DispatchRepository } from "@/core/domain/repositories/dispatch-repository";
import { apiRequest } from "../http/api-client";

export class HttpDispatchRepository implements DispatchRepository {
  board(municipalityId?: number) {
    return apiRequest<DispatchBoardSnapshot>("GET", "/dispatch/orders", { query: { municipalityId } });
  }

  couriers(query: { municipalityId?: number; order?: string }) {
    return apiRequest<{ freshSeconds: number; couriers: DispatchCourier[] }>("GET", "/dispatch/couriers", { query });
  }

  sendOffer(code: string, offer: Parameters<DispatchRepository["sendOffer"]>[1]) {
    return apiRequest<{ offerId: string; expiresAt: string; recipients: number }>("POST", `/dispatch/orders/${encodeURIComponent(code)}/offers`, { body: offer });
  }

  activity(filters: Parameters<DispatchRepository["activity"]>[0], cursor?: string) {
    return apiRequest<StaffActivityPage>("GET", "/admin/audit", { query: { ...filters, cursor } });
  }

  activityActors() {
    return apiRequest<{ userId: string; givenNames: string; familyNames: string | null }[]>("GET", "/admin/audit/actors");
  }
}
