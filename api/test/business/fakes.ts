import { Principal } from '../../src/modules/identity/domain/principal';
import { MunicipalityDirectory, MunicipalityInfo } from '../../src/modules/business-config/domain/ports/municipalities';
import { ScheduleException, ScheduleRepository, WeeklySlot } from '../../src/modules/business-config/domain/ports/schedule.repository';
import { CommissionVersion, SettingChange, SettingRecord, SettingsRepository } from '../../src/modules/business-config/domain/ports/settings.repository';
import { DeliveryQuote, FeeChange, ZoneData, ZoneOverlap, ZoneRecord, ZonesRepository } from '../../src/modules/business-config/domain/ports/zones.repository';
import { GeoPoint } from '../../src/modules/catalog/domain/value-objects/geo-point';
import { GeoPolygon } from '../../src/modules/catalog/domain/value-objects/geo-polygon';

/** Dobles en memoria de los puertos de business-config: los casos de uso se prueban sin base de datos. */

export const admin: Principal = {
  userId: 'admin-1',
  sessionId: 's-1',
  role: 'ADMIN',
  permissions: new Set(['zones.manage', 'hours.manage', 'settings.manage', 'commission.manage']),
  municipalityId: null,
};
export const scopedAdmin = (municipalityId: number): Principal => ({ ...admin, userId: `admin-${municipalityId}`, municipalityId });

export class MemoryMunicipalities extends MunicipalityDirectory {
  rows: MunicipalityInfo[] = [{ id: 1, name: 'Villagarzón', timeZone: 'America/Bogota', center: { lat: 1.03, lng: -76.62 }, launched: true }];
  async list(scope: number | null) {
    return this.rows.filter((m) => scope === null || m.id === scope);
  }
  async find(id: number) {
    return this.rows.find((m) => m.id === id) ?? null;
  }
}

export class MemoryZones extends ZonesRepository {
  readonly rows = new Map<string, ZoneRecord & { active: boolean; polygon: GeoPolygon }>();
  readonly fees: { zoneId: string; fee: string }[] = [];
  overlapping: ZoneOverlap[] = [];
  trimResult: [number, number][] | 'EMPTY' | 'SPLIT' = 'EMPTY';
  establishments = new Map<string, number>();
  private seq = 0;

  async list(municipalityId: number) {
    return [...this.rows.values()].filter((z) => z.active && z.municipalityId === municipalityId);
  }
  async find(id: string) {
    const row = this.rows.get(id);
    return row?.active ? row : null;
  }
  async nameTaken(municipalityId: number, name: string, exceptId?: string) {
    return [...this.rows.values()].some((z) => z.active && z.municipalityId === municipalityId && z.id !== exceptId && z.name.toLowerCase() === name.toLowerCase());
  }
  async overlaps() {
    return this.overlapping;
  }
  async trim() {
    return this.trimResult;
  }
  async create(municipalityId: number, data: ZoneData) {
    const id = `zone-${++this.seq}`;
    this.rows.set(id, {
      id,
      municipalityId,
      name: data.name,
      kind: data.kind,
      area: data.area.closedRing().slice(0, -1),
      polygon: data.area,
      areaSquareMeters: Math.round(data.area.squareMeters()),
      fee: data.fee,
      feeSince: new Date(),
      sortOrder: this.seq,
      createdAt: new Date(),
      active: true,
    });
    this.fees.push({ zoneId: id, fee: data.fee });
    return id;
  }
  async replace(id: string, data: ZoneData) {
    const old = this.rows.get(id)!;
    old.active = false;
    return this.create(old.municipalityId, data);
  }
  async rename(id: string, name: string) {
    this.rows.get(id)!.name = name;
  }
  async changeFee(id: string, fee: string) {
    this.rows.get(id)!.fee = fee;
    this.fees.push({ zoneId: id, fee });
  }
  async deactivate(id: string) {
    this.rows.get(id)!.active = false;
  }
  async reorder(_: number, ids: string[]) {
    ids.forEach((id, i) => (this.rows.get(id)!.sortOrder = i + 1));
  }
  async feeHistory(id: string): Promise<FeeChange[]> {
    return this.fees.filter((f) => f.zoneId === id).map((f) => ({ fee: f.fee, createdAt: new Date(), createdBy: 'Admin' }));
  }
  async quote(municipalityId: number, point: GeoPoint): Promise<DeliveryQuote | null> {
    const zone = [...this.rows.values()].find((z) => z.active && z.municipalityId === municipalityId && z.polygon.covers(point));
    return zone ? { deliveryZoneFeeId: `fee-${zone.id}`, fee: zone.fee, zone: { id: zone.id, name: zone.name, kind: zone.kind } } : null;
  }
  async establishmentMunicipality(id: string) {
    return this.establishments.get(id) ?? null;
  }
}

export class MemorySchedule extends ScheduleRepository {
  slots: WeeklySlot[] = [];
  exceptionRows: ScheduleException[] = [];
  async weekly() {
    return this.slots;
  }
  async replaceWeekly(_: number, slots: WeeklySlot[]) {
    const added = slots.length;
    this.slots = slots;
    return { added, removed: 0 };
  }
  async exceptions(_: number, fromDate: string) {
    return this.exceptionRows.filter((e) => e.date >= fromDate);
  }
  async setException(_: number, exception: ScheduleException) {
    this.exceptionRows = [...this.exceptionRows.filter((e) => e.date !== exception.date), exception];
  }
  async removeException(_: number, date: string) {
    const before = this.exceptionRows.length;
    this.exceptionRows = this.exceptionRows.filter((e) => e.date !== date);
    return this.exceptionRows.length < before;
  }
}

export class MemorySettings extends SettingsRepository {
  values: { key: string; municipalityId: number | null; value: string; by: string | null }[] = [
    { key: 'offers.timeout_seconds', municipalityId: null, value: '60', by: null },
    { key: 'otp.max_attempts', municipalityId: null, value: '5', by: null },
  ];
  commissions: (CommissionVersion & { municipalityId: number })[] = [];
  definitions = [
    { key: 'offers.timeout_seconds', type: 'SECONDS' as const, min: '15', max: '600', scoped: true },
    { key: 'otp.max_attempts', type: 'INTEGER' as const, min: '1', max: '10', scoped: false },
  ];

  async list(municipalityId: number | null) {
    return this.definitions.map((d) => this.record(d.key, municipalityId)!);
  }
  async find(key: string, municipalityId: number | null) {
    return this.record(key, municipalityId);
  }
  async insert(input: { key: string; municipalityId: number | null; value: string; actorUserId: string }) {
    this.values.push({ key: input.key, municipalityId: input.municipalityId, value: input.value, by: input.actorUserId });
  }
  async history(key: string): Promise<SettingChange[]> {
    return this.values
      .filter((v) => v.key === key)
      .reverse()
      .map((v) => ({ value: v.value, municipalityId: v.municipalityId, createdAt: new Date(), createdBy: v.by }));
  }
  async commissionHistory(municipalityId: number, limit: number) {
    return this.commissions.filter((c) => c.municipalityId === municipalityId).reverse().slice(0, limit);
  }
  async insertCommission(input: { municipalityId: number; rate: string; actorUserId: string }) {
    this.commissions.push({ municipalityId: input.municipalityId, rate: input.rate, createdAt: new Date(), createdBy: input.actorUserId });
  }

  private record(key: string, municipalityId: number | null): SettingRecord | null {
    const d = this.definitions.find((x) => x.key === key);
    if (!d) return null;
    const of = (scope: number | null) => {
      const last = this.values.filter((v) => v.key === key && v.municipalityId === scope).pop();
      return last ? { value: last.value, createdAt: new Date(), createdBy: last.by } : null;
    };
    return {
      ...d,
      defaultValue: this.values.find((v) => v.key === key && v.municipalityId === null)?.value ?? null,
      global: of(null),
      municipal: d.scoped && municipalityId !== null ? of(municipalityId) : null,
    };
  }
}
