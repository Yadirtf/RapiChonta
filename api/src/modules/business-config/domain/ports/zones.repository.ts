import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { GeoPolygon } from '../../../catalog/domain/value-objects/geo-polygon';
import { ZoneKindCode } from '../business-config.codes';

export interface ZoneData {
  name: string;
  kind: ZoneKindCode;
  area: GeoPolygon;
  /** Tarifa en pesos, texto decimal ("3000.00"). */
  fee: string;
  /** Se guarda `area` menos lo que ya cubren las demás zonas (botón "Recortar" del panel). */
  trimOverlaps: boolean;
}

export interface ZoneRecord {
  id: string;
  municipalityId: number;
  name: string;
  kind: ZoneKindCode;
  /** Vértices [lng, lat] sin repetir el primero. */
  area: [number, number][];
  areaSquareMeters: number;
  fee: string;
  feeSince: Date;
  sortOrder: number;
  createdAt: Date;
}

export interface ZoneOverlap {
  id: string;
  name: string;
  overlapSquareMeters: number;
}

export interface DeliveryQuote {
  /** Lo que guardará el pedido (E04): la versión de la tarifa, no la zona. */
  deliveryZoneFeeId: string;
  fee: string;
  zone: { id: string; name: string; kind: ZoneKindCode };
}

export interface FeeChange {
  fee: string;
  createdAt: Date;
  createdBy: string | null;
}

/** Zonas de entrega con tarifa fija (Docs/14-base-de-datos/E03). Las tarifas son versiones inmutables. */
export abstract class ZonesRepository {
  abstract list(municipalityId: number): Promise<ZoneRecord[]>;
  abstract find(id: string): Promise<ZoneRecord | null>;
  abstract nameTaken(municipalityId: number, name: string, exceptId?: string): Promise<boolean>;
  /** Zonas activas cuya intersección con `area` tiene superficie (las que solo se tocan no cuentan). */
  abstract overlaps(municipalityId: number, area: GeoPolygon, exceptId?: string): Promise<ZoneOverlap[]>;
  /** `area` menos las zonas activas: un anillo, 'EMPTY' si no queda nada o 'SPLIT' si queda en varias piezas. */
  abstract trim(municipalityId: number, area: GeoPolygon, exceptId?: string): Promise<[number, number][] | 'EMPTY' | 'SPLIT'>;
  abstract create(municipalityId: number, data: ZoneData, actorUserId: string): Promise<string>;
  /** Polígono o tipo nuevos: se da de baja la zona y nace otra (los pedidos viejos conservan la suya). */
  abstract replace(id: string, data: ZoneData, actorUserId: string): Promise<string>;
  abstract rename(id: string, name: string, actorUserId: string): Promise<void>;
  abstract changeFee(id: string, fee: string, actorUserId: string): Promise<void>;
  abstract deactivate(id: string, actorUserId: string): Promise<void>;
  abstract reorder(municipalityId: number, ids: string[]): Promise<void>;
  abstract feeHistory(id: string): Promise<FeeChange[]>;
  /** Tarifa vigente de la zona que cubre el punto (ST_Covers), o null si está fuera de cobertura. */
  abstract quote(municipalityId: number, point: GeoPoint): Promise<DeliveryQuote | null>;
  abstract establishmentMunicipality(establishmentId: string): Promise<number | null>;
}
