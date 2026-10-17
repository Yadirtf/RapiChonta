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
} from "../entities/business";
import type { LngLat } from "../entities/catalog-admin";
import type { Account } from "../entities/account";

/** Puerto del panel para zonas, horario, parámetros y comisión (E03). `municipalityId` opcional: el del alcance. */
export interface BusinessAdminRepository {
  options(): Promise<BusinessOptions>;

  zones(municipalityId?: number): Promise<{ municipality: Municipality; zones: Zone[] }>;
  createZone(input: ZoneInput, municipalityId?: number): Promise<Zone>;
  updateZone(id: string, input: ZoneInput): Promise<Zone>;
  deactivateZone(id: string): Promise<void>;
  reorderZones(ids: string[], municipalityId?: number): Promise<void>;
  trimZone(area: LngLat[], exceptId?: string, municipalityId?: number): Promise<LngLat[]>;
  zoneFees(id: string): Promise<FeeChange[]>;

  schedule(municipalityId?: number): Promise<Schedule>;
  setWeekly(days: ScheduleDay[], municipalityId?: number): Promise<Schedule>;
  setException(date: string, input: { closed: boolean; slots: TimeSlot[]; reason: string | null }, municipalityId?: number): Promise<Schedule>;
  removeException(date: string, municipalityId?: number): Promise<Schedule>;

  settings(municipalityId?: number): Promise<{ municipality: Municipality; canEditGlobal: boolean; settings: Setting[] }>;
  changeSetting(key: string, value: string, scope: "GLOBAL" | "MUNICIPALITY", municipalityId?: number): Promise<Setting>;
  settingHistory(key: string, municipalityId?: number): Promise<SettingChange[]>;
  commission(municipalityId?: number): Promise<Commission>;
  changeCommission(percent: string, municipalityId?: number): Promise<Commission>;

  exchangeRates(): Promise<ExchangeRate[]>;
  refreshExchangeRates(): Promise<ExchangeRate[]>;
}

/** Lo que ve el cliente: estado de atención, tarifa a un punto y tasas para el aproximado. */
export interface BusinessPublicRepository {
  status(municipalityId?: number): Promise<BusinessStatus>;
  quote(establishmentId: string, point: { lat: number; lng: number }): Promise<DeliveryQuote>;
  exchangeRates(): Promise<ExchangeRate[]>;
  setDisplayCurrency(currency: DisplayCurrency | null): Promise<Account>;
}
