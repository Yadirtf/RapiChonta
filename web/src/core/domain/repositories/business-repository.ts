import type {
  BusinessOptions,
  BusinessStatus,
  Commission,
  CoverageArea,
  CoverageCheck,
  CoverageInput,
  CoverageZone,
  DeliveryQuote,
  DisplayCurrency,
  ExchangeRate,
  FeeChange,
  Municipality,
  MunicipalityOverview,
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
import type { AdminPaymentOption, PaymentMethodCode } from "../entities/order";

/** Puerto del panel para zonas, horario, parámetros y comisión (E03). `municipalityId` opcional: el del alcance. */
export interface BusinessAdminRepository {
  options(): Promise<BusinessOptions>;

  coverage(): Promise<MunicipalityOverview[]>;
  saveCoverage(input: CoverageInput, municipalityId: number): Promise<CoverageZone>;
  removeCoverage(municipalityId: number): Promise<void>;
  updateMunicipality(id: number, change: { launched?: boolean; center?: { lat: number; lng: number } }): Promise<Municipality>;

  zones(municipalityId?: number): Promise<{ municipality: Municipality; zones: Zone[]; coverage: CoverageZone | null }>;
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

  /** "¿Cómo pagas al recibir?": cada cambio devuelve la lista completa, ya ordenada. */
  paymentOptions(): Promise<AdminPaymentOption[]>;
  reorderPaymentOptions(codes: PaymentMethodCode[]): Promise<AdminPaymentOption[]>;
  updatePaymentOption(code: PaymentMethodCode, change: { offered?: boolean; imageFileId?: string | null }): Promise<AdminPaymentOption[]>;
}

/** Lo que ve el cliente: estado de atención, tarifa a un punto y tasas para el aproximado. */
export interface BusinessPublicRepository {
  status(municipalityId?: number): Promise<BusinessStatus>;
  quote(establishmentId: string, point: { lat: number; lng: number }): Promise<DeliveryQuote>;
  /** Cobertura de los municipios abiertos, para dibujarla en el mapa del cliente (H03.5). */
  coverage(): Promise<CoverageArea[]>;
  /** Si el punto (GPS o pin) está dentro de alguna cobertura, y si no, a cuántos metros queda. */
  checkCoverage(point: { lat: number; lng: number }): Promise<CoverageCheck>;
  exchangeRates(): Promise<ExchangeRate[]>;
  setDisplayCurrency(currency: DisplayCurrency | null): Promise<Account>;
}
