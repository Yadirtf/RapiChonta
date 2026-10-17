import { Injectable } from '@nestjs/common';
import { Principal } from '../../../identity/domain/principal';
import { CatalogErrors } from '../../domain/catalog.errors';
import { PRODUCT_STATUSES, ProductStatusCode } from '../../domain/catalog.codes';
import { EstablishmentAdminRepository } from '../../domain/ports/establishment-admin.repository';
import { AdminMenu, MenuRepository, ProductState, ProductVersionEntry } from '../../domain/ports/menu.repository';
import { normalizeNames, normalizeProductTexts, sameProductTexts, Translations } from '../../domain/value-objects/localized-text';
import { assertPrepMinutes, Price } from '../../domain/value-objects/price';
import { ensureInScope } from './scope';

export const MAX_PRODUCT_IMAGES = 5;

export interface ProductInput {
  sectionId: string;
  texts: Translations<{ name?: string; description?: string | null }>;
  price: string;
  prepMinutes: number;
}

/** Acceso al menú de un local según el alcance del rol (404 si no es suyo). */
@Injectable()
export class MenuAccess {
  constructor(
    private readonly establishments: EstablishmentAdminRepository,
    private readonly menu: MenuRepository,
  ) {}

  async establishment(principal: Principal, establishmentId: string): Promise<void> {
    ensureInScope(principal, (await this.establishments.scopeOf(establishmentId))?.municipalityId);
  }

  async section(principal: Principal, sectionId: string) {
    const section = await this.menu.section(sectionId);
    if (!section) throw CatalogErrors.sectionNotFound();
    await this.establishment(principal, section.establishmentId);
    return section;
  }

  async product(principal: Principal, productId: string): Promise<ProductState> {
    const product = await this.menu.product(productId);
    if (!product) throw CatalogErrors.productNotFound();
    await this.establishment(principal, product.establishmentId);
    return product;
  }
}

/** Reordenar exige la lista completa y exacta de los elementos actuales (evita perder uno por una vista vieja). */
function assertSameItems(current: string[], requested: string[]): void {
  if (current.length !== requested.length || new Set(requested).size !== requested.length || !requested.every((id) => current.includes(id))) {
    throw CatalogErrors.invalidOrder();
  }
}

@Injectable()
export class GetMenuAdminUseCase {
  constructor(
    private readonly access: MenuAccess,
    private readonly menu: MenuRepository,
  ) {}

  async execute(principal: Principal, establishmentId: string): Promise<AdminMenu> {
    await this.access.establishment(principal, establishmentId);
    return this.menu.menu(establishmentId);
  }
}

/** Secciones del menú (H02.2): "Hamburguesas", "Bebidas". Nombre obligatorio en español. */
@Injectable()
export class ManageSectionsUseCase {
  constructor(
    private readonly access: MenuAccess,
    private readonly menu: MenuRepository,
  ) {}

  async create(principal: Principal, establishmentId: string, names: Translations<string>): Promise<string> {
    await this.access.establishment(principal, establishmentId);
    return this.menu.createSection(establishmentId, normalizeNames(names));
  }

  async rename(principal: Principal, sectionId: string, names: Translations<string>): Promise<void> {
    await this.access.section(principal, sectionId);
    await this.menu.renameSection(sectionId, normalizeNames(names));
  }

  /** Solo una sección sin productos a la venta; los descontinuados se conservan para los pedidos viejos. */
  async remove(principal: Principal, sectionId: string): Promise<void> {
    const section = await this.access.section(principal, sectionId);
    if (section.liveProducts > 0) throw CatalogErrors.sectionNotEmpty();
    await this.menu.deactivateSection(sectionId);
  }

  async reorder(principal: Principal, establishmentId: string, ids: string[]): Promise<void> {
    await this.access.establishment(principal, establishmentId);
    assertSameItems(await this.menu.sectionIds(establishmentId), ids);
    await this.menu.reorderSections(establishmentId, ids);
  }
}

/**
 * Productos (H02.2). Precio, tiempo y textos son una versión inmutable: editarlos crea otra versión y los
 * pedidos ya hechos siguen apuntando a la suya ("cambiar un precio no altera los pedidos ya creados").
 */
@Injectable()
export class ManageProductsUseCase {
  constructor(
    private readonly access: MenuAccess,
    private readonly menu: MenuRepository,
  ) {}

  async create(principal: Principal, establishmentId: string, input: ProductInput): Promise<string> {
    await this.access.establishment(principal, establishmentId);
    const section = await this.menu.section(input.sectionId);
    if (!section || section.establishmentId !== establishmentId) throw CatalogErrors.sectionNotFound();
    return this.menu.createProduct({
      establishmentId,
      sectionId: input.sectionId,
      price: Price.parse(input.price),
      prepMinutes: assertPrepMinutes(input.prepMinutes),
      texts: normalizeProductTexts(input.texts),
      actorUserId: principal.userId,
    });
  }

  /** Devuelve si se creó una versión nueva (false cuando solo cambió la sección o nada). */
  async update(principal: Principal, productId: string, input: ProductInput): Promise<{ newVersion: boolean }> {
    const product = await this.access.product(principal, productId);
    if (product.status === PRODUCT_STATUSES.DISCONTINUED) throw CatalogErrors.productDiscontinued();
    if (input.sectionId !== product.sectionId) {
      const section = await this.menu.section(input.sectionId);
      if (!section || section.establishmentId !== product.establishmentId) throw CatalogErrors.sectionNotFound();
    }
    const price = Price.parse(input.price);
    const prepMinutes = assertPrepMinutes(input.prepMinutes);
    const texts = normalizeProductTexts(input.texts);
    const changed = !price.equals(product.price) || prepMinutes !== product.prepMinutes || !sameProductTexts(texts, product.texts);
    const moved = input.sectionId !== product.sectionId;
    if (!changed && !moved) return { newVersion: false };
    await this.menu.updateProduct({
      id: productId,
      sectionId: moved ? input.sectionId : undefined,
      version: changed ? { price, prepMinutes, texts } : undefined,
      actorUserId: principal.userId,
    });
    return { newVersion: changed };
  }

  /** Disponible ↔ agotado varias veces al día; descontinuado es final (product_status_transitions). */
  async changeStatus(principal: Principal, productId: string, to: ProductStatusCode): Promise<void> {
    const product = await this.access.product(principal, productId);
    if (product.status === to || !(await this.menu.isTransitionAllowed(product.status, to))) throw CatalogErrors.invalidTransition();
    await this.menu.changeProductStatus({ id: productId, from: product.status, to, actorUserId: principal.userId });
  }

  async reorder(principal: Principal, sectionId: string, ids: string[]): Promise<void> {
    await this.access.section(principal, sectionId);
    assertSameItems(await this.menu.productIds(sectionId), ids);
    await this.menu.reorderProducts(sectionId, ids);
  }

  async versions(principal: Principal, productId: string): Promise<ProductVersionEntry[]> {
    await this.access.product(principal, productId);
    return this.menu.versions(productId);
  }
}

/** Fotos del producto (H02.3). La de menor orden es la principal. */
@Injectable()
export class ManageProductImagesUseCase {
  constructor(
    private readonly access: MenuAccess,
    private readonly menu: MenuRepository,
    private readonly establishments: EstablishmentAdminRepository,
  ) {}

  async add(principal: Principal, productId: string, fileId: string): Promise<void> {
    const product = await this.access.product(principal, productId);
    if (product.imageFileIds.includes(fileId)) return;
    if (product.imageFileIds.length >= MAX_PRODUCT_IMAGES) throw CatalogErrors.tooManyImages(MAX_PRODUCT_IMAGES);
    if (!(await this.establishments.fileIsUsableAs(fileId, 'PRODUCT_IMAGE'))) throw CatalogErrors.fileNotUsable();
    await this.menu.addImage(productId, fileId);
  }

  async remove(principal: Principal, productId: string, fileId: string): Promise<void> {
    await this.access.product(principal, productId);
    if (!(await this.menu.removeImage(productId, fileId))) throw CatalogErrors.imageNotFound();
  }

  async makePrimary(principal: Principal, productId: string, fileId: string): Promise<void> {
    await this.access.product(principal, productId);
    if (!(await this.menu.makeImagePrimary(productId, fileId))) throw CatalogErrors.imageNotFound();
  }
}
