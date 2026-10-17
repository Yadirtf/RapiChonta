import { EstablishmentStatusCode } from '../catalog.codes';
import { GeoPoint } from '../value-objects/geo-point';
import { GeoPolygon } from '../value-objects/geo-polygon';

export interface EstablishmentPhone {
  phone: string;
  label: string | null;
}

export interface EstablishmentData {
  municipalityId: number;
  name: string;
  addressLine: string;
  location: GeoPoint;
  area: GeoPolygon;
  /** Primera = principal (define el ícono del mapa). */
  categories: string[];
  phones: EstablishmentPhone[];
  logoFileId: string | null;
}

export interface EstablishmentSummary {
  id: string;
  name: string;
  addressLine: string;
  municipality: { id: number; name: string };
  status: EstablishmentStatusCode;
  primaryCategory: string | null;
  logoFileId: string | null;
  location: { lat: number; lng: number };
  productCount: number;
  availableCount: number;
  updatedAt: Date;
}

export interface EstablishmentDetail extends EstablishmentSummary {
  area: [number, number][];
  areaSquareMeters: number;
  categories: string[];
  phones: EstablishmentPhone[];
  allowedTransitions: EstablishmentStatusCode[];
  createdAt: Date;
}

export abstract class EstablishmentAdminRepository {
  abstract list(filter: { municipalityId: number | null; status?: EstablishmentStatusCode; search?: string }): Promise<EstablishmentSummary[]>;
  abstract findById(id: string): Promise<EstablishmentDetail | null>;
  abstract scopeOf(id: string): Promise<{ municipalityId: number; status: EstablishmentStatusCode } | null>;
  abstract create(data: EstablishmentData, actorUserId: string): Promise<string>;
  abstract update(id: string, data: EstablishmentData, actorUserId: string): Promise<void>;
  abstract isTransitionAllowed(from: EstablishmentStatusCode, to: EstablishmentStatusCode): Promise<boolean>;
  abstract changeStatus(input: { id: string; from: EstablishmentStatusCode; to: EstablishmentStatusCode; actorUserId: string }): Promise<void>;
  abstract countOrderableProducts(id: string): Promise<number>;
  abstract nameTaken(municipalityId: number, name: string, exceptId?: string): Promise<boolean>;
  abstract activeCategoryCodes(codes: string[]): Promise<string[]>;
  /** Municipios donde se puede registrar; `covers` dice si el punto cae en su límite (true si no tiene límite). */
  abstract municipality(id: number, point?: GeoPoint): Promise<{ id: number; covers: boolean } | null>;
  abstract municipalities(scope: number | null): Promise<{ id: number; name: string; center: { lat: number; lng: number }; launched: boolean }[]>;
  abstract fileIsUsableAs(fileId: string, purpose: string): Promise<boolean>;
}
