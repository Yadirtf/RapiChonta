export type EstablishmentCategory = "FAST_FOOD" | "RESTAURANT" | "SUPERMARKET" | "STORE" | "PHARMACY";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Establishment {
  id: string;
  name: string;
  category: EstablishmentCategory;
  address: string;
  isPartner: boolean;
  logoUrl: string | null;
  location: GeoPoint;
  distanceMeters: number;
}
