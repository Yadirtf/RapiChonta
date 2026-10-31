import type { EstablishmentStatus, GeoPoint, ProductStatus, Translations } from "./establishment";

/** Vértice [lng, lat], el orden que usa GeoJSON y que espera la API. */
export type LngLat = [number, number];

export interface ProductTexts {
  name: string;
  description: string | null;
}

export interface CatalogOptions {
  municipalities: { id: number; name: string; center: GeoPoint; launched: boolean }[];
  categories: { code: string; icon: string; names: Translations<string> }[];
  icons: string[];
  limits: {
    area: { minVertices: number; maxVertices: number; minSquareMeters: number; maxSquareMeters: number };
    prepMinutes: { min: number; max: number };
    productImages: number;
  };
}

/** Lo que el editor del menú necesita saber de los límites (lo usan el panel y el portal del comercio). */
export type MenuLimits = Pick<CatalogOptions["limits"], "prepMinutes" | "productImages">;

export interface EstablishmentPhone {
  phone: string;
  label: string | null;
}

export interface AdminEstablishmentSummary {
  id: string;
  name: string;
  addressLine: string;
  municipality: { id: number; name: string };
  status: EstablishmentStatus;
  primaryCategory: string | null;
  logoFileId: string | null;
  logoUrl: string | null;
  location: GeoPoint;
  productCount: number;
  availableCount: number;
  updatedAt: string;
}

export interface AdminEstablishment extends AdminEstablishmentSummary {
  area: LngLat[];
  areaSquareMeters: number;
  categories: string[];
  phones: EstablishmentPhone[];
  allowedTransitions: EstablishmentStatus[];
  createdAt: string;
}

export interface EstablishmentInput {
  municipalityId?: number;
  name: string;
  addressLine: string;
  location: GeoPoint;
  area: LngLat[];
  categories: string[];
  phones: EstablishmentPhone[];
  logoFileId: string | null;
}

export interface AdminProduct {
  id: string;
  sectionId: string;
  status: ProductStatus;
  sortOrder: number;
  versionId: string;
  price: string;
  prepMinutes: number;
  texts: Translations<ProductTexts>;
  images: { fileId: string; url: string | null }[];
  updatedAt: string;
}

export interface AdminSection {
  id: string;
  names: Translations<string>;
  sortOrder: number;
  products: AdminProduct[];
}

export interface AdminMenu {
  establishmentId: string;
  sections: AdminSection[];
  discontinued: AdminProduct[];
}

export interface ProductInput {
  sectionId: string;
  texts: Translations<ProductTexts>;
  price: string;
  prepMinutes: number;
}

export interface ProductVersion {
  id: string;
  price: string;
  prepMinutes: number;
  name: string;
  createdAt: string;
  createdBy: string | null;
}

export interface AdminCategory {
  id: number;
  code: string;
  icon: string;
  names: Translations<string>;
  sortOrder: number;
  active: boolean;
  establishmentCount: number;
}

export interface CategoryInput {
  code?: string;
  icon: string;
  names: Translations<string>;
}

export type UploadPurpose = "PRODUCT_IMAGE" | "ESTABLISHMENT_LOGO" | "PAYMENT_METHOD_IMAGE" | "PARTNERSHIP_AGREEMENT";
