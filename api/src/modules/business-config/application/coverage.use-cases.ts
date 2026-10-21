import { Injectable } from '@nestjs/common';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { GeoPolygon } from '../../catalog/domain/value-objects/geo-polygon';
import { Price } from '../../catalog/domain/value-objects/price';
import { Principal } from '../../identity/domain/principal';
import { ZONE_KINDS, ZONE_SHAPES, ZoneShapeCode } from '../domain/business-config.codes';
import { BusinessErrors } from '../domain/business-config.errors';
import { MunicipalityDirectory, MunicipalityInfo, MunicipalityReadiness } from '../domain/ports/municipalities';
import { ZoneData, ZoneRecord, ZonesRepository } from '../domain/ports/zones.repository';
import { GeoCircle } from '../domain/value-objects/geo-circle';
import { COVERAGE_LIMITS } from '../domain/value-objects/zone-limits';
import { MunicipalityScope } from './municipality-scope';
import { sameRing } from './zones.use-cases';

export type CoverageInput = {
  municipalityId?: number;
  fee: string | number;
} & ({ shape: typeof ZONE_SHAPES.CIRCLE; center: { lat: number; lng: number }; radiusMeters: number } | { shape: typeof ZONE_SHAPES.POLYGON; area: [number, number][] });

export interface MunicipalityOverview {
  municipality: MunicipalityInfo;
  coverage: ZoneRecord | null;
  /** Barrios y veredas con tarifa propia. */
  zoneCount: number;
  readiness: MunicipalityReadiness;
}

/**
 * Cobertura por municipio (H03.5): el administrador fija hasta dónde llegan los domiciliarios, como radio
 * alrededor de un centro o como área dibujada, con una tarifa base; y abre o pausa cada municipio.
 * La cobertura es una zona de tipo COVERAGE: el pedido la valida y la cobra igual que a un barrio (E04).
 */
@Injectable()
export class ManageCoverageUseCase {
  constructor(
    private readonly zones: ZonesRepository,
    private readonly scope: MunicipalityScope,
    private readonly municipalities: MunicipalityDirectory,
  ) {}

  async overview(principal: Principal): Promise<MunicipalityOverview[]> {
    // Los abiertos primero: son los que se atienden hoy; después, los que están en preparación.
    const list = [...(await this.scope.list(principal))].sort((a, b) => Number(b.launched) - Number(a.launched) || a.name.localeCompare(b.name, 'es'));
    const readiness = await this.municipalities.readiness(list.map((m) => m.id));
    return Promise.all(
      list.map(async (municipality) => {
        const zones = await this.zones.list(municipality.id);
        return {
          municipality,
          coverage: zones.find((z) => z.kind === ZONE_KINDS.COVERAGE) ?? null,
          zoneCount: zones.filter((z) => z.kind !== ZONE_KINDS.COVERAGE).length,
          readiness: readiness.get(municipality.id) ?? { coverage: false, hours: false, commission: false },
        };
      }),
    );
  }

  async save(principal: Principal, input: CoverageInput): Promise<ZoneRecord> {
    const municipality = await this.scope.resolve(principal, input.municipalityId);
    const data = this.validate(municipality, input);
    const current = await this.current(municipality.id);
    if (!current) {
      if (await this.zones.nameTaken(municipality.id, data.name)) throw BusinessErrors.zoneNameTaken();
      return (await this.zones.find(await this.zones.create(municipality.id, data, principal.userId)))!;
    }
    if (current.shape !== data.shape || !sameGeometry(current, input)) {
      return (await this.zones.find(await this.zones.replace(current.id, data, principal.userId)))!;
    }
    if (!Price.parse(current.fee).equals(Price.parse(data.fee))) await this.zones.changeFee(current.id, data.fee, principal.userId);
    return (await this.zones.find(current.id))!;
  }

  async remove(principal: Principal, municipalityId?: number): Promise<void> {
    const municipality = await this.scope.resolve(principal, municipalityId);
    const current = await this.current(municipality.id);
    if (!current) throw BusinessErrors.coverageNotFound();
    await this.zones.deactivate(current.id, principal.userId);
  }

  /**
   * Abrir un municipio lo pone en el mapa del cliente y habilita los pedidos; pausarlo los detiene sin borrar
   * nada. Solo el administrador general, y solo si ya tiene cobertura, horario y comisión.
   */
  async update(principal: Principal, municipalityId: number, change: { launched?: boolean; center?: { lat: number; lng: number } }) {
    if (principal.municipalityId !== null) throw BusinessErrors.globalAdminOnly();
    const municipality = await this.scope.resolve(principal, municipalityId);
    const center = change.center ? GeoPoint.create(change.center.lat, change.center.lng) : undefined;
    if (change.launched === true && !municipality.launched) {
      const readiness = (await this.municipalities.readiness([municipality.id])).get(municipality.id);
      const missing = readiness ? (Object.keys(readiness) as (keyof MunicipalityReadiness)[]).filter((k) => !readiness[k]).map((k) => k.toUpperCase()) : ['COVERAGE', 'HOURS', 'COMMISSION'];
      if (missing.length) throw BusinessErrors.municipalityNotReady(missing);
    }
    await this.municipalities.update(
      municipality.id,
      { launched: change.launched, center: center && { lat: center.latitude, lng: center.longitude } },
      principal.userId,
    );
    return (await this.municipalities.find(municipality.id))!;
  }

  private async current(municipalityId: number) {
    return (await this.zones.list(municipalityId)).find((z) => z.kind === ZONE_KINDS.COVERAGE) ?? null;
  }

  private validate(municipality: MunicipalityInfo, input: CoverageInput): ZoneData {
    const fee = Price.parse(String(input.fee).replace(',', '.')).toDecimalString();
    const shape: ZoneShapeCode = input.shape === ZONE_SHAPES.CIRCLE ? ZONE_SHAPES.CIRCLE : ZONE_SHAPES.POLYGON;
    const area =
      input.shape === ZONE_SHAPES.CIRCLE
        ? GeoCircle.create(GeoPoint.create(input.center?.lat, input.center?.lng), input.radiusMeters).toPolygon(COVERAGE_LIMITS)
        : GeoPolygon.fromRing((input as { area: [number, number][] }).area, COVERAGE_LIMITS);
    return { name: `Cobertura ${municipality.name}`.slice(0, 80), kind: ZONE_KINDS.COVERAGE, shape, area, fee, trimOverlaps: false };
  }
}

/** Mismo trazo que el guardado: cambiar solo la tarifa conserva la zona (y su historial de tarifas). */
function sameGeometry(current: ZoneRecord, input: CoverageInput): boolean {
  if (input.shape === ZONE_SHAPES.POLYGON) return sameRing(current.area, input.area);
  const circle = current.circle;
  return (
    !!circle &&
    Math.abs(circle.center.lat - input.center.lat) < 1e-6 &&
    Math.abs(circle.center.lng - input.center.lng) < 1e-6 &&
    Math.abs(circle.radiusMeters - input.radiusMeters) < 1
  );
}

export type CoverageCheck =
  | { covered: true; municipality: { id: number; name: string }; zone: { name: string; kind: string }; fee: string }
  | { covered: false; nearest: { municipalityName: string; distanceMeters: number } | null };

/** Lo que ve el cliente (H03.5): hasta dónde llegamos, y si su ubicación o el pin que puso queda dentro. */
@Injectable()
export class PublicCoverageUseCase {
  constructor(private readonly zones: ZonesRepository) {}

  map(municipalityId?: number) {
    return this.zones.coverage(municipalityId);
  }

  async check(input: { latitude: number; longitude: number }): Promise<CoverageCheck> {
    const point = GeoPoint.create(input.latitude, input.longitude);
    const found = await this.zones.locate(point);
    if (found) {
      const { quote } = found;
      return { covered: true, municipality: { id: found.municipalityId, name: found.municipalityName }, zone: { name: quote.zone.name, kind: quote.zone.kind }, fee: quote.fee };
    }
    const nearest = await this.zones.distanceToCoverage(point);
    return { covered: false, nearest: nearest && { municipalityName: nearest.municipalityName, distanceMeters: nearest.meters } };
  }
}
