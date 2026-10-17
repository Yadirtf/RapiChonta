import type { Account } from "@/core/domain/entities/account";
import type {
  BusinessOptions,
  BusinessStatus,
  Commission,
  DeliveryQuote,
  DisplayCurrency,
  ExchangeRate,
  FeeChange,
  Municipality,
  Schedule,
  ScheduleDay,
  Setting,
  SettingChange,
  TimeSlot,
  Zone,
  ZoneInput,
} from "@/core/domain/entities/business";
import type { LngLat } from "@/core/domain/entities/catalog-admin";
import type { BusinessAdminRepository, BusinessPublicRepository } from "@/core/domain/repositories/business-repository";
import { apiGet, apiRequest } from "../http/api-client";

const id = (value: string) => encodeURIComponent(value);
const BASE = "/admin/business";

export class HttpBusinessAdminRepository implements BusinessAdminRepository {
  options() {
    return apiRequest<BusinessOptions>("GET", `${BASE}/options`);
  }

  zones(municipalityId?: number) {
    return apiRequest<{ municipality: Municipality; zones: Zone[] }>("GET", `${BASE}/zones`, { query: { municipalityId } });
  }

  createZone(input: ZoneInput, municipalityId?: number) {
    return apiRequest<Zone>("POST", `${BASE}/zones`, { body: { ...input, municipalityId } });
  }

  updateZone(zoneId: string, input: ZoneInput) {
    return apiRequest<Zone>("PUT", `${BASE}/zones/${id(zoneId)}`, { body: input });
  }

  deactivateZone(zoneId: string) {
    return apiRequest<void>("DELETE", `${BASE}/zones/${id(zoneId)}`);
  }

  reorderZones(ids: string[], municipalityId?: number) {
    return apiRequest<void>("PUT", `${BASE}/zones/order`, { body: { ids, municipalityId } });
  }

  async trimZone(area: LngLat[], exceptId?: string, municipalityId?: number) {
    return (await apiRequest<{ area: LngLat[] }>("POST", `${BASE}/zones/trim`, { body: { area, exceptId, municipalityId } })).area;
  }

  zoneFees(zoneId: string) {
    return apiRequest<FeeChange[]>("GET", `${BASE}/zones/${id(zoneId)}/fees`);
  }

  schedule(municipalityId?: number) {
    return apiRequest<Schedule>("GET", `${BASE}/schedule`, { query: { municipalityId } });
  }

  setWeekly(days: ScheduleDay[], municipalityId?: number) {
    return apiRequest<Schedule>("PUT", `${BASE}/schedule`, { body: { days, municipalityId } });
  }

  setException(date: string, input: { closed: boolean; slots: TimeSlot[]; reason: string | null }, municipalityId?: number) {
    return apiRequest<Schedule>("PUT", `${BASE}/schedule/exceptions/${id(date)}`, { body: { ...input, slots: input.closed ? undefined : input.slots, municipalityId } });
  }

  removeException(date: string, municipalityId?: number) {
    return apiRequest<Schedule>("DELETE", `${BASE}/schedule/exceptions/${id(date)}`, { query: { municipalityId } });
  }

  settings(municipalityId?: number) {
    return apiRequest<{ municipality: Municipality; canEditGlobal: boolean; settings: Setting[] }>("GET", `${BASE}/settings`, { query: { municipalityId } });
  }

  changeSetting(key: string, value: string, scope: "GLOBAL" | "MUNICIPALITY", municipalityId?: number) {
    return apiRequest<Setting>("PUT", `${BASE}/settings/${id(key)}`, { body: { value, scope, municipalityId } });
  }

  settingHistory(key: string, municipalityId?: number) {
    return apiRequest<SettingChange[]>("GET", `${BASE}/settings/${id(key)}/history`, { query: { municipalityId } });
  }

  commission(municipalityId?: number) {
    return apiRequest<Commission>("GET", `${BASE}/commission`, { query: { municipalityId } });
  }

  changeCommission(percent: string, municipalityId?: number) {
    return apiRequest<Commission>("PUT", `${BASE}/commission`, { body: { percent, municipalityId } });
  }

  exchangeRates() {
    return apiRequest<ExchangeRate[]>("GET", `${BASE}/exchange-rates`);
  }

  refreshExchangeRates() {
    return apiRequest<ExchangeRate[]>("POST", `${BASE}/exchange-rates/refresh`);
  }
}

export class HttpBusinessPublicRepository implements BusinessPublicRepository {
  status(municipalityId?: number) {
    return apiGet<BusinessStatus>("/business/status", { municipalityId });
  }

  quote(establishmentId: string, point: { lat: number; lng: number }) {
    return apiGet<DeliveryQuote>("/delivery/quote", { establishmentId, lat: point.lat, lng: point.lng });
  }

  exchangeRates() {
    return apiGet<ExchangeRate[]>("/business/exchange-rates");
  }

  setDisplayCurrency(currency: DisplayCurrency | null) {
    return apiRequest<Account>("PUT", "/me/display-currency", { body: { currency } });
  }
}
