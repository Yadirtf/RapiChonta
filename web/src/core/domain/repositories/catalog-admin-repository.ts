import type {
  AdminCategory,
  AdminEstablishment,
  AdminEstablishmentSummary,
  AdminMenu,
  CatalogOptions,
  CategoryInput,
  EstablishmentInput,
  ProductInput,
  ProductVersion,
  UploadPurpose,
} from "../entities/catalog-admin";
import type { EstablishmentStatus, ProductStatus, Translations } from "../entities/establishment";

/** Puerto del panel para establecimientos, menús y categorías (E02). */
export interface CatalogAdminRepository {
  options(): Promise<CatalogOptions>;

  establishments(filter: { status?: EstablishmentStatus; search?: string }): Promise<AdminEstablishmentSummary[]>;
  establishment(id: string): Promise<AdminEstablishment>;
  createEstablishment(input: EstablishmentInput): Promise<AdminEstablishment>;
  updateEstablishment(id: string, input: EstablishmentInput): Promise<AdminEstablishment>;
  changeEstablishmentStatus(id: string, status: EstablishmentStatus): Promise<AdminEstablishment>;

  menu(establishmentId: string): Promise<AdminMenu>;
  createSection(establishmentId: string, names: Translations<string>): Promise<string>;
  renameSection(sectionId: string, names: Translations<string>): Promise<void>;
  removeSection(sectionId: string): Promise<void>;
  reorderSections(establishmentId: string, ids: string[]): Promise<void>;
  createProduct(establishmentId: string, input: ProductInput): Promise<string>;
  updateProduct(productId: string, input: ProductInput): Promise<{ newVersion: boolean }>;
  changeProductStatus(productId: string, status: ProductStatus): Promise<void>;
  reorderProducts(sectionId: string, ids: string[]): Promise<void>;
  productVersions(productId: string): Promise<ProductVersion[]>;
  addProductImage(productId: string, fileId: string): Promise<void>;
  makeProductImagePrimary(productId: string, fileId: string): Promise<void>;
  removeProductImage(productId: string, fileId: string): Promise<void>;

  categories(): Promise<AdminCategory[]>;
  createCategory(input: CategoryInput): Promise<number>;
  updateCategory(id: number, input: CategoryInput): Promise<void>;
  setCategoryActive(id: number, active: boolean): Promise<void>;
  reorderCategories(ids: number[]): Promise<void>;
}

/** Sube una imagen y devuelve el id del archivo listo para asociarlo (producto o logo). */
export interface FileUploader {
  uploadImage(file: Blob, purpose: UploadPurpose): Promise<string>;
}
