import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { GeoPolygon } from '../../../catalog/domain/value-objects/geo-polygon';
import { ZoneKindCode, ZoneShapeCode } from '../business-config.codes';

export interface ZoneData {
  name: string;
  kind: ZoneKindCode;
  shape: ZoneShapeCode;
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
  shape: ZoneShapeCode;
  /** Vértices [lng, lat] sin repetir el primero. */
  area: [number, number][];
  /** Solo si se trazó como radio: centro y radio recuperados del polígono guardado. */
  circle: { center: { lat: number; lng: number }; radiusMeters: number } | null;
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

/** Hasta dónde llega RapiChonta en un municipio abierto: la unión de sus zonas activas (lo que ve el cliente). */
export interface MunicipalityCoverage {
  municipality: { id: number; name: string; center: { lat: number; lng: number } };
  /** Polígonos [lng, lat] en orden GeoJSON (MultiPolygon), simplificados para dibujarlos. */
  polygons: [number, number][][][];
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
  /** Cobertura de los municipios abiertos (o de uno), para el mapa del cliente. */
  abstract coverage(municipalityId?: number): Promise<MunicipalityCoverage[]>;
  /** Municipio abierto cuya cobertura contiene el punto, con la tarifa que aplicaría. */
  abstract locate(point: GeoPoint): Promise<{ municipalityId: number; municipalityName: string; quote: DeliveryQuote } | null>;
  /** Metros desde el punto hasta la cobertura más cercana (de un municipio o de todos los abiertos). */
  abstract distanceToCoverage(point: GeoPoint, municipalityId?: number): Promise<{ meters: number; municipalityName: string } | null>;
}
