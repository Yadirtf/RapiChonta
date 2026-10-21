import type { LngLat } from "./catalog-admin";
import type { GeoPoint } from "./establishment";

/** Tipos de zona del catálogo `zone_kinds` (E03): barrios del casco urbano o veredas. */
export type ZoneKind = "URBAN" | "RURAL";
export const ZONE_KINDS: readonly ZoneKind[] = ["URBAN", "RURAL"];

export interface Municipality {
  id: number;
  name: string;
  department: string;
  timeZone: string;
  center: GeoPoint;
  /** Abierto: aparece en el mapa del cliente y recibe pedidos. */
  launched: boolean;
}

/** Cómo se trazó un área (catálogo `zone_shapes`): a mano o como radio alrededor de un centro. */
export type ZoneShape = "POLYGON" | "CIRCLE";

export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  shape: ZoneShape;
  /** Solo si se trazó como radio. */
  circle: { center: GeoPoint; radiusMeters: number } | null;
  area: LngLat[];
  areaSquareMeters: number;
  /** Texto decimal ("3000.00"). */
  fee: string;
  feeSince: string;
  sortOrder: number;
}

/** Cobertura del municipio: una zona de tipo COVERAGE (se administra en la página Cobertura). */
export type CoverageZone = Omit<Zone, "kind"> & { kind: "COVERAGE" };

export interface ZoneInput {
  name: string;
  kind: ZoneKind;
  area: LngLat[];
  fee: string;
  trimOverlaps?: boolean;
}

export interface ZoneLimits {
  minVertices: number;
  maxVertices: number;
  minSquareMeters: number;
  maxSquareMeters: number;
}

export interface BusinessOptions {
  municipalities: Municipality[];
  zoneKinds: ZoneKind[];
  limits: { zone: ZoneLimits; coverage: ZoneLimits; radius: { minMeters: number; maxMeters: number }; slotsPerDay: number };
}

/** Cobertura de un municipio (H03.5): hasta dónde llegan los domiciliarios, con tarifa base. */
export type CoverageInput = { fee: string } & ({ shape: "CIRCLE"; center: GeoPoint; radiusMeters: number } | { shape: "POLYGON"; area: LngLat[] });

/** Lo que le falta a un municipio para abrir. */
export type ReadinessItem = "coverage" | "hours" | "commission";
export const READINESS_ITEMS: readonly ReadinessItem[] = ["coverage", "hours", "commission"];

export interface MunicipalityOverview {
  municipality: Municipality;
  coverage: CoverageZone | null;
  zoneCount: number;
  readiness: Record<ReadinessItem, boolean>;
}

/** Cobertura pública de un municipio abierto: la unión de sus zonas (MultiPolygon [lng, lat]). */
export interface CoverageArea {
  municipality: { id: number; name: string; center: GeoPoint };
  polygons: LngLat[][][];
}

export type CoverageCheck =
  | { covered: true; municipality: { id: number; name: string }; zone: { name: string; kind: string }; fee: string }
  | { covered: false; nearest: { municipalityName: string; distanceMeters: number } | null };

export interface FeeChange {
  fee: string;
  since: string;
  by: string | null;
}

/** Zona con la que choca una nueva (detalle de ZONE_OVERLAP). */
export interface ZoneOverlap {
  id: string;
  name: string;
  overlapSquareMeters: number;
}

/** Franja "HH:MM"–"HH:MM" en la hora local del municipio. */
export interface TimeSlot {
  opensAt: string;
  closesAt: string;
}

/** 0 = domingo … 6 = sábado. */
export interface ScheduleDay {
  weekday: number;
  slots: TimeSlot[];
}

export interface ScheduleException {
  date: string;
  closed: boolean;
  slots: TimeSlot[];
  reason: string | null;
}

export interface OpeningStatus {
  open: boolean;
  closesAt: string | null;
  nextOpeningAt: string | null;
}

export interface Schedule {
  municipality: Municipality;
  weekly: ScheduleDay[];
  exceptions: ScheduleException[];
  status: OpeningStatus;
}

export interface BusinessStatus extends OpeningStatus {
  municipality: Municipality;
}

export type SettingType = "INTEGER" | "MONEY_COP" | "SECONDS" | "METERS" | "DAYS";

export interface SettingVersion {
  value: string;
  createdAt: string;
  createdBy: string | null;
}

export interface Setting {
  key: string;
  type: SettingType;
  min: string | null;
  max: string | null;
  scoped: boolean;
  defaultValue: string | null;
  global: SettingVersion | null;
  municipal: SettingVersion | null;
}

export interface SettingChange extends SettingVersion {
  municipalityId: number | null;
}

export interface CommissionVersion {
  /** "12.50" */
  percent: string;
  since: string;
  by: string | null;
}

export interface Commission {
  municipality: Municipality;
  current: CommissionVersion | null;
  history: CommissionVersion[];
}

export type DisplayCurrency = "USD" | "EUR";
export const DISPLAY_CURRENCIES: readonly DisplayCurrency[] = ["USD", "EUR"];

export interface ExchangeRate {
  currency: DisplayCurrency;
  copPerUnit: string;
  fetchedAt: string;
  isToday: boolean;
}

export interface DeliveryQuote {
  fee: string;
  zone: { name: string; kind: ZoneKind };
}

/** Valor vigente de un parámetro: el del municipio si tiene uno, si no el global. */
export const effectiveValue = (s: Setting) => s.municipal?.value ?? s.global?.value ?? s.defaultValue;

/** Valor aproximado en otra moneda (solo para mostrar; se cobra en pesos). */
export function approximate(cents: number, rate: ExchangeRate | undefined): number | null {
  const perUnit = rate ? Number(rate.copPerUnit) : NaN;
  if (!(perUnit > 0) || !Number.isFinite(cents)) return null;
  return cents / 100 / perUnit;
}

/** "08:30" ↔ minutos desde la medianoche ("24:00" = 1440, fin del día). */
export const clockToMinutes = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};
export const minutesToClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Problema de un día del horario (la API vuelve a validar al guardar). */
export function dayProblem(slots: TimeSlot[]): "INVALID_TIME_SLOT" | "OVERLAPPING_TIME_SLOTS" | null {
  const ranges = slots.map((s) => [clockToMinutes(s.opensAt), clockToMinutes(s.closesAt)] as const).sort((a, b) => a[0] - b[0]);
  if (ranges.some(([o, c]) => !(c > o) || o >= 1440 || c > 1440 || Number.isNaN(o) || Number.isNaN(c))) return "INVALID_TIME_SLOT";
  for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) return "OVERLAPPING_TIME_SLOTS";
  return null;
}
