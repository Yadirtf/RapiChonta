/** Idiomas en que se escriben nombres y descripciones del catálogo (el español es obligatorio). */
export type ContentLanguage = "es" | "en";
export type Translations<T> = { es: T; en?: T };

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Categoría del catálogo `establishment_categories`: la crea el administrador, no está fija en el código. */
export interface Category {
  code: string;
  /** Nombre de un ícono de lucide (lista cerrada que define la API). */
  icon: string;
  names: Translations<string>;
}

export const localized = (names: Translations<string> | undefined, locale: string) =>
  (locale === "en" ? names?.en : undefined) || names?.es || "";

/** Establecimiento en el mapa (GET /establishments/nearby). */
export interface Establishment {
  id: string;
  name: string;
  /** Código de la categoría principal. */
  category: string;
  categoryIcon: string;
  address: string;
  /** Solo los establecimientos registrados y activos reciben pedidos (MVP). */
  acceptsOrders: boolean;
  logoUrl: string | null;
  location: GeoPoint;
  distanceMeters: number;
}

export type EstablishmentStatus = "DRAFT" | "ACTIVE" | "TEMPORARILY_CLOSED" | "INACTIVE";
export type ProductStatus = "AVAILABLE" | "SOLD_OUT" | "DISCONTINUED";

export interface MenuProduct {
  id: string;
  /** Versión vigente: el pedido citará esta versión (precio y textos inmutables). */
  versionId: string;
  name: string;
  description: string | null;
  /** Pesos colombianos como texto decimal ("12000.00"): nunca se opera en punto flotante. */
  price: string;
  prepMinutes: number;
  status: ProductStatus;
  orderable: boolean;
  imageUrl: string | null;
}

export interface MenuSection {
  id: string;
  name: string;
  products: MenuProduct[];
}

/** Página del establecimiento con su menú en el idioma pedido (GET /establishments/:id). */
export interface EstablishmentDetail {
  id: string;
  name: string;
  address: string;
  status: EstablishmentStatus;
  acceptsOrders: boolean;
  location: GeoPoint;
  distanceMeters: number | null;
  logoUrl: string | null;
  categories: { code: string; icon: string; primary: boolean }[];
  sections: MenuSection[];
}

/** Distancia en línea recta (haversine). Igual que la API: basta para mostrar "a 350 m". */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
}
