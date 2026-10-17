import { ContentLanguage } from '../catalog.codes';
import { Translations } from '../value-objects/localized-text';
import { GeoPoint } from '../value-objects/geo-point';

export interface CategoryView {
  code: string;
  icon: string;
  names: Translations<string>;
}

export interface NearbyQuery {
  origin: GeoPoint;
  radiusMeters: number;
  categories?: string[];
  limit: number;
}

/** Lo que el mapa necesita de un local (v_map_establishments). */
export interface MapEstablishment {
  id: string;
  name: string;
  category: string | null;
  categoryIcon: string | null;
  address: string;
  acceptsOrders: boolean;
  logoFileId: string | null;
  location: GeoPoint;
  distanceMeters: number;
}

export interface MenuProductView {
  id: string;
  /** Versión exacta que el cliente ve y que el pedido guardará (E04). */
  versionId: string;
  name: string;
  description: string | null;
  price: string;
  prepMinutes: number;
  status: string;
  orderable: boolean;
  imageFileId: string | null;
}

export interface MenuSectionView {
  id: string;
  name: string;
  products: MenuProductView[];
}

export interface PublicEstablishment {
  id: string;
  name: string;
  address: string;
  status: string;
  acceptsOrders: boolean;
  location: GeoPoint;
  distanceMeters: number | null;
  logoFileId: string | null;
  categories: { code: string; icon: string; primary: boolean }[];
  sections: MenuSectionView[];
}

/** Lecturas públicas (cliente). Solo lo visible: las reglas viven en v_map_establishments y v_menu. */
export abstract class PublicCatalogRepository {
  abstract categories(): Promise<CategoryView[]>;
  abstract nearby(query: NearbyQuery): Promise<MapEstablishment[]>;
  abstract establishment(id: string, language: ContentLanguage, origin?: GeoPoint): Promise<PublicEstablishment | null>;
}
