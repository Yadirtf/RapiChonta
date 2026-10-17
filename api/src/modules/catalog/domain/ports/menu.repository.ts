import { ProductStatusCode } from '../catalog.codes';
import { ProductText, Translations } from '../value-objects/localized-text';
import { Price } from '../value-objects/price';

export interface AdminMenuProduct {
  id: string;
  sectionId: string;
  status: ProductStatusCode;
  sortOrder: number;
  versionId: string;
  price: string;
  prepMinutes: number;
  texts: Translations<ProductText>;
  imageFileIds: string[];
  updatedAt: Date;
}

export interface AdminMenuSection {
  id: string;
  names: Translations<string>;
  sortOrder: number;
  products: AdminMenuProduct[];
}

export interface AdminMenu {
  establishmentId: string;
  sections: AdminMenuSection[];
  /** Productos que ya no se venden: no se muestran al cliente pero se conservan (los pedidos los citan). */
  discontinued: AdminMenuProduct[];
}

export interface ProductState {
  id: string;
  establishmentId: string;
  sectionId: string;
  status: ProductStatusCode;
  price: Price;
  prepMinutes: number;
  texts: Translations<ProductText>;
  imageFileIds: string[];
}

export interface ProductVersionEntry {
  id: string;
  price: string;
  prepMinutes: number;
  name: string;
  createdAt: Date;
  createdBy: string | null;
}

export abstract class MenuRepository {
  abstract menu(establishmentId: string): Promise<AdminMenu>;

  abstract section(id: string): Promise<{ id: string; establishmentId: string; liveProducts: number } | null>;
  abstract createSection(establishmentId: string, names: Translations<string>): Promise<string>;
  abstract renameSection(id: string, names: Translations<string>): Promise<void>;
  abstract deactivateSection(id: string): Promise<void>;
  abstract sectionIds(establishmentId: string): Promise<string[]>;
  abstract reorderSections(establishmentId: string, ids: string[]): Promise<void>;

  abstract product(id: string): Promise<ProductState | null>;
  abstract createProduct(input: {
    establishmentId: string;
    sectionId: string;
    price: Price;
    prepMinutes: number;
    texts: Translations<ProductText>;
    actorUserId: string;
  }): Promise<string>;
  /** Nueva versión inmutable (precio, tiempo y textos) y/o cambio de sección, con auditoría. */
  abstract updateProduct(input: {
    id: string;
    sectionId?: string;
    version?: { price: Price; prepMinutes: number; texts: Translations<ProductText> };
    actorUserId: string;
  }): Promise<void>;
  abstract isTransitionAllowed(from: ProductStatusCode, to: ProductStatusCode): Promise<boolean>;
  abstract changeProductStatus(input: { id: string; from: ProductStatusCode; to: ProductStatusCode; actorUserId: string }): Promise<void>;
  abstract productIds(sectionId: string): Promise<string[]>;
  abstract reorderProducts(sectionId: string, ids: string[]): Promise<void>;
  abstract addImage(productId: string, fileId: string): Promise<void>;
  abstract removeImage(productId: string, fileId: string): Promise<boolean>;
  abstract makeImagePrimary(productId: string, fileId: string): Promise<boolean>;
  abstract versions(productId: string): Promise<ProductVersionEntry[]>;
}
