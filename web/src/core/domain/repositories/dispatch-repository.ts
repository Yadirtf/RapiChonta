import type { DispatchBoardSnapshot, DispatchCourier, OfferMode, StaffActivityFilters, StaffActivityPage } from "../entities/dispatch";

/** Puerto de la central de despacho (E07) y del registro del personal (H07.5). */
export interface DispatchRepository {
  board(municipalityId?: number): Promise<DispatchBoardSnapshot>;
  couriers(query: { municipalityId?: number; order?: string }): Promise<{ freshSeconds: number; couriers: DispatchCourier[] }>;
  sendOffer(code: string, offer: { mode: OfferMode; courierUserId?: string }): Promise<{ offerId: string; expiresAt: string; recipients: number }>;
  activity(filters: StaffActivityFilters, cursor?: string): Promise<StaffActivityPage>;
  activityActors(): Promise<{ userId: string; givenNames: string; familyNames: string | null }[]>;
}
