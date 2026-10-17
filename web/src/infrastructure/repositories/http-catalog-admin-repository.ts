import type {
  AdminCategory,
  AdminEstablishment,
  AdminEstablishmentSummary,
  AdminMenu,
  AdminProduct,
  CatalogOptions,
  CategoryInput,
  EstablishmentInput,
  ProductInput,
  ProductVersion,
} from "@/core/domain/entities/catalog-admin";
import type { EstablishmentStatus, ProductStatus, Translations } from "@/core/domain/entities/establishment";
import type { CatalogAdminRepository } from "@/core/domain/repositories/catalog-admin-repository";
import { apiRequest, resolveApiAsset } from "../http/api-client";

const id = (value: string) => encodeURIComponent(value);
const withLogo = <T extends { logoUrl: string | null }>(e: T): T => ({ ...e, logoUrl: resolveApiAsset(e.logoUrl) });
const withImages = (p: AdminProduct): AdminProduct => ({ ...p, images: p.images.map((i) => ({ ...i, url: resolveApiAsset(i.url) })) });

export class HttpCatalogAdminRepository implements CatalogAdminRepository {
  options() {
    return apiRequest<CatalogOptions>("GET", "/admin/catalog/options");
  }

  async establishments(filter: { status?: EstablishmentStatus; search?: string }) {
    const list = await apiRequest<AdminEstablishmentSummary[]>("GET", "/admin/establishments", { query: { status: filter.status, q: filter.search } });
    return list.map(withLogo);
  }

  async establishment(establishmentId: string) {
    return withLogo(await apiRequest<AdminEstablishment>("GET", `/admin/establishments/${id(establishmentId)}`));
  }

  async createEstablishment(input: EstablishmentInput) {
    return withLogo(await apiRequest<AdminEstablishment>("POST", "/admin/establishments", { body: input }));
  }

  async updateEstablishment(establishmentId: string, input: EstablishmentInput) {
    return withLogo(await apiRequest<AdminEstablishment>("PUT", `/admin/establishments/${id(establishmentId)}`, { body: input }));
  }

  async changeEstablishmentStatus(establishmentId: string, status: EstablishmentStatus) {
    return withLogo(await apiRequest<AdminEstablishment>("POST", `/admin/establishments/${id(establishmentId)}/status`, { body: { status } }));
  }

  async menu(establishmentId: string) {
    const menu = await apiRequest<AdminMenu>("GET", `/admin/establishments/${id(establishmentId)}/menu`);
    return {
      ...menu,
      sections: menu.sections.map((s) => ({ ...s, products: s.products.map(withImages) })),
      discontinued: menu.discontinued.map(withImages),
    };
  }

  async createSection(establishmentId: string, names: Translations<string>) {
    return (await apiRequest<{ id: string }>("POST", `/admin/establishments/${id(establishmentId)}/sections`, { body: { names } })).id;
  }

  renameSection(sectionId: string, names: Translations<string>) {
    return apiRequest<void>("PUT", `/admin/sections/${id(sectionId)}`, { body: { names } });
  }

  removeSection(sectionId: string) {
    return apiRequest<void>("DELETE", `/admin/sections/${id(sectionId)}`);
  }

  reorderSections(establishmentId: string, ids: string[]) {
    return apiRequest<void>("PUT", `/admin/establishments/${id(establishmentId)}/sections/order`, { body: { ids } });
  }

  async createProduct(establishmentId: string, input: ProductInput) {
    return (await apiRequest<{ id: string }>("POST", `/admin/establishments/${id(establishmentId)}/products`, { body: input })).id;
  }

  updateProduct(productId: string, input: ProductInput) {
    return apiRequest<{ newVersion: boolean }>("PUT", `/admin/products/${id(productId)}`, { body: input });
  }

  changeProductStatus(productId: string, status: ProductStatus) {
    return apiRequest<void>("POST", `/admin/products/${id(productId)}/status`, { body: { status } });
  }

  reorderProducts(sectionId: string, ids: string[]) {
    return apiRequest<void>("PUT", `/admin/sections/${id(sectionId)}/products/order`, { body: { ids } });
  }

  productVersions(productId: string) {
    return apiRequest<ProductVersion[]>("GET", `/admin/products/${id(productId)}/versions`);
  }

  addProductImage(productId: string, fileId: string) {
    return apiRequest<void>("POST", `/admin/products/${id(productId)}/images`, { body: { fileId } });
  }

  makeProductImagePrimary(productId: string, fileId: string) {
    return apiRequest<void>("POST", `/admin/products/${id(productId)}/images/${id(fileId)}/primary`);
  }

  removeProductImage(productId: string, fileId: string) {
    return apiRequest<void>("DELETE", `/admin/products/${id(productId)}/images/${id(fileId)}`);
  }

  categories() {
    return apiRequest<AdminCategory[]>("GET", "/admin/categories");
  }

  async createCategory(input: CategoryInput) {
    return (await apiRequest<{ id: number }>("POST", "/admin/categories", { body: input })).id;
  }

  updateCategory(categoryId: number, input: CategoryInput) {
    return apiRequest<void>("PUT", `/admin/categories/${categoryId}`, { body: { icon: input.icon, names: input.names } });
  }

  setCategoryActive(categoryId: number, active: boolean) {
    return apiRequest<void>("POST", `/admin/categories/${categoryId}/active`, { body: { active } });
  }

  reorderCategories(ids: number[]) {
    return apiRequest<void>("PUT", "/admin/categories/order", { body: { ids } });
  }
}
