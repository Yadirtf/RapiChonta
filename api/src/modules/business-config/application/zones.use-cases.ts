import { Injectable } from '@nestjs/common';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { GeoPolygon } from '../../catalog/domain/value-objects/geo-polygon';
import { Price } from '../../catalog/domain/value-objects/price';
import { Principal } from '../../identity/domain/principal';
import { ZONE_KINDS, ZoneKindCode } from '../domain/business-config.codes';
import { BusinessErrors } from '../domain/business-config.errors';
import { DeliveryQuote, ZoneData, ZoneRecord, ZonesRepository } from '../domain/ports/zones.repository';
import { ZONE_LIMITS } from '../domain/value-objects/zone-limits';
import { MunicipalityScope } from './municipality-scope';

export interface ZoneInput {
  municipalityId?: number;
  name: string;
  kind: ZoneKindCode;
  /** Vértices [lng, lat]. */
  area: [number, number][];
  fee: string | number;
  /** Guardar quitando lo que se superpone con otras zonas, en vez de rechazarlo. */
  trimOverlaps?: boolean;
}

const cleanName = (name: string) => (typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 80) : '');

/**
 * Zonas de entrega con tarifa fija (H03.1, RF-14): barrios (URBAN) y veredas (RURAL). Dos zonas activas no
 * se superponen: el panel recibe con cuáles choca (ZONE_OVERLAP) y puede recortar la nueva automáticamente.
 */
@Injectable()
export class ManageZonesUseCase {
  constructor(
    private readonly zones: ZonesRepository,
    private readonly scope: MunicipalityScope,
  ) {}

  async list(principal: Principal, municipalityId?: number) {
    const municipality = await this.scope.resolve(principal, municipalityId);
    return { municipality, zones: await this.zones.list(municipality.id) };
  }

  async create(principal: Principal, input: ZoneInput): Promise<ZoneRecord> {
    const municipality = await this.scope.resolve(principal, input.municipalityId);
    const data = await this.validate(municipality.id, input);
    const id = await this.zones.create(municipality.id, data, principal.userId);
    return (await this.zones.find(id))!;
  }

  async update(principal: Principal, id: string, input: ZoneInput): Promise<ZoneRecord> {
    const current = await this.inScope(principal, id);
    const data = await this.validate(current.municipalityId, input, id);
    let resultId = id;
    if (data.trimOverlaps || !sameRing(current.area, input.area) || current.kind !== data.kind) {
      resultId = await this.zones.replace(id, data, principal.userId);
    } else {
      if (current.name !== data.name) await this.zones.rename(id, data.name, principal.userId);
      if (!Price.parse(current.fee).equals(Price.parse(data.fee))) await this.zones.changeFee(id, data.fee, principal.userId);
    }
    return (await this.zones.find(resultId))!;
  }

  async deactivate(principal: Principal, id: string): Promise<void> {
    await this.inScope(principal, id);
    await this.zones.deactivate(id, principal.userId);
  }

  async reorder(principal: Principal, municipalityId: number | undefined, ids: string[]): Promise<void> {
    const municipality = await this.scope.resolve(principal, municipalityId);
    const current = (await this.zones.list(municipality.id)).map((z) => z.id);
    if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((zoneId) => current.includes(zoneId))) {
      throw BusinessErrors.zoneNotFound();
    }
    await this.zones.reorder(municipality.id, ids);
  }

  async feeHistory(principal: Principal, id: string) {
    await this.inScope(principal, id);
    return this.zones.feeHistory(id);
  }

  /** Quita de `area` lo que ya cubren otras zonas: así se dibujan barrios vecinos sin calcar el borde. */
  async trim(principal: Principal, input: { municipalityId?: number; area: [number, number][]; exceptId?: string }): Promise<[number, number][]> {
    const municipality = await this.scope.resolve(principal, input.municipalityId);
    if (input.exceptId) await this.inScope(principal, input.exceptId);
    return this.trimmedRing(municipality.id, GeoPolygon.fromRing(input.area, ZONE_LIMITS), input.exceptId);
  }

  private async trimmedRing(municipalityId: number, area: GeoPolygon, exceptId?: string): Promise<[number, number][]> {
    const result = await this.zones.trim(municipalityId, area, exceptId);
    if (result === 'EMPTY') throw BusinessErrors.zoneTrimEmpty();
    if (result === 'SPLIT') throw BusinessErrors.zoneTrimSplit();
    // El resultado vuelve a validarse con los mismos límites (puede quedar muy pequeño).
    return GeoPolygon.fromRing(result, ZONE_LIMITS).closedRing().slice(0, -1);
  }

  private async validate(municipalityId: number, input: ZoneInput, exceptId?: string): Promise<ZoneData> {
    const name = cleanName(input.name);
    if (name.length < 2) throw BusinessErrors.zoneNameRequired();
    const kind = Object.values(ZONE_KINDS).includes(input.kind) ? input.kind : ZONE_KINDS.URBAN;
    const fee = Price.parse(String(input.fee).replace(',', '.')).toDecimalString();
    const area = GeoPolygon.fromRing(input.area, ZONE_LIMITS);
    if (await this.zones.nameTaken(municipalityId, name, exceptId)) throw BusinessErrors.zoneNameTaken();
    const trimOverlaps = input.trimOverlaps === true;
    if (trimOverlaps) {
      await this.trimmedRing(municipalityId, area, exceptId);
    } else {
      const overlaps = await this.zones.overlaps(municipalityId, area, exceptId);
      if (overlaps.length) throw BusinessErrors.zoneOverlap(overlaps);
    }
    return { name, kind, area, fee, trimOverlaps };
  }

  private async inScope(principal: Principal, id: string): Promise<ZoneRecord> {
    const zone = await this.zones.find(id);
    if (!zone || (principal.municipalityId !== null && principal.municipalityId !== zone.municipalityId)) throw BusinessErrors.zoneNotFound();
    return zone;
  }
}

/**
 * Tarifa para entregar en un punto (H03.1, H04.2): la de la zona que lo cubre en el municipio del local.
 * Sin zona: NO_COVERAGE, y el cliente lo ve antes de confirmar.
 */
@Injectable()
export class QuoteDeliveryUseCase {
  constructor(private readonly zones: ZonesRepository) {}

  async execute(input: { establishmentId: string; latitude: number; longitude: number }): Promise<DeliveryQuote> {
    const point = GeoPoint.create(input.latitude, input.longitude);
    const municipalityId = await this.zones.establishmentMunicipality(input.establishmentId);
    if (municipalityId === null) throw BusinessErrors.establishmentNotFound();
    const quote = await this.zones.quote(municipalityId, point);
    if (!quote) throw BusinessErrors.noCoverage();
    return quote;
  }
}

/** Compara con lo que envió el panel (sin redondear): reenviar el mismo anillo no crea una zona nueva. */
function sameRing(a: [number, number][], b: [number, number][]): boolean {
  if (!Array.isArray(b)) return false;
  const ring = b.length > 1 && b[0][0] === b[b.length - 1][0] && b[0][1] === b[b.length - 1][1] ? b.slice(0, -1) : b;
  return a.length === ring.length && a.every(([lng, lat], i) => Math.abs(lng - ring[i][0]) < 1e-6 && Math.abs(lat - ring[i][1]) < 1e-6);
}
