import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ROLES } from '../../../identity/domain/identity.codes';
import { Principal } from '../../../identity/domain/principal';
import { CurrentPrincipal, RequirePermissions, Roles } from '../../../identity/presentation/http/decorators/auth.decorators';
import { ManageCategoriesUseCase } from '../../application/admin/categories.use-cases';
import {
  ChangeEstablishmentStatusUseCase,
  CreateEstablishmentUseCase,
  GetEstablishmentAdminUseCase,
  ListEstablishmentsUseCase,
  UpdateEstablishmentUseCase,
} from '../../application/admin/establishments.use-cases';
import {
  GetMenuAdminUseCase,
  ManageProductImagesUseCase,
  ManageProductsUseCase,
  ManageSectionsUseCase,
  MAX_PRODUCT_IMAGES,
} from '../../application/admin/menu.use-cases';
import { CATALOG_PERMISSIONS } from '../../domain/catalog.codes';
import { EstablishmentAdminRepository } from '../../domain/ports/establishment-admin.repository';
import { CATEGORY_ICONS } from '../../domain/value-objects/category-code';
import { AREA_LIMITS } from '../../domain/value-objects/geo-polygon';
import { PREP_MINUTES } from '../../domain/value-objects/price';
import { CatalogPresenter } from './catalog-presenter';
import {
  CategoryActiveDto,
  CategoryDto,
  CategoryOrderDto,
  EstablishmentDto,
  EstablishmentStatusDto,
  ListEstablishmentsQueryDto,
  OrderDto,
  ProductDto,
  ProductImageDto,
  ProductStatusDto,
  SectionDto,
} from './dto/admin.dto';

const { ESTABLISHMENTS_MANAGE, PRODUCTS_MANAGE, CATEGORIES_MANAGE } = CATALOG_PERMISSIONS;

/** Panel: establecimientos con su área en el mapa (H02.1) y categorías (H02.4). El menú está en AdminMenuController. */
@Controller('admin')
@Roles(ROLES.ADMIN, ROLES.OPERATOR)
export class AdminCatalogController {
  constructor(
    private readonly establishments: EstablishmentAdminRepository,
    private readonly listEstablishments: ListEstablishmentsUseCase,
    private readonly getEstablishment: GetEstablishmentAdminUseCase,
    private readonly createEstablishment: CreateEstablishmentUseCase,
    private readonly updateEstablishment: UpdateEstablishmentUseCase,
    private readonly changeStatus: ChangeEstablishmentStatusUseCase,
    private readonly categories: ManageCategoriesUseCase,
    private readonly presenter: CatalogPresenter,
  ) {}

  /** Opciones de los formularios: municipios del alcance, categorías, íconos y límites. */
  @Get('catalog/options')
  @RequirePermissions(ESTABLISHMENTS_MANAGE)
  async options(@CurrentPrincipal() principal: Principal) {
    const [municipalities, categories] = await Promise.all([this.establishments.municipalities(principal.municipalityId), this.categories.list()]);
    return {
      municipalities,
      categories: categories.filter((c) => c.active).map(({ code, icon, names }) => ({ code, icon, names })),
      icons: CATEGORY_ICONS,
      limits: { area: AREA_LIMITS, prepMinutes: PREP_MINUTES, productImages: MAX_PRODUCT_IMAGES },
    };
  }

  // ─────────────── Establecimientos ───────────────

  @Get('establishments')
  @RequirePermissions(ESTABLISHMENTS_MANAGE)
  async list(@CurrentPrincipal() principal: Principal, @Query() query: ListEstablishmentsQueryDto) {
    return (await this.listEstablishments.execute(principal, { status: query.status, search: query.q })).map((e) => this.presenter.summary(e));
  }

  @Post('establishments')
  @RequirePermissions(ESTABLISHMENTS_MANAGE)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: EstablishmentDto) {
    const id = await this.createEstablishment.execute(principal, body);
    return this.presenter.detail(await this.getEstablishment.execute(principal, id));
  }

  @Get('establishments/:id')
  @RequirePermissions(ESTABLISHMENTS_MANAGE)
  async detail(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.presenter.detail(await this.getEstablishment.execute(principal, id));
  }

  @Put('establishments/:id')
  @RequirePermissions(ESTABLISHMENTS_MANAGE)
  async update(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: EstablishmentDto) {
    await this.updateEstablishment.execute(principal, id, body);
    return this.presenter.detail(await this.getEstablishment.execute(principal, id));
  }

  @Post('establishments/:id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(ESTABLISHMENTS_MANAGE)
  async status(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: EstablishmentStatusDto) {
    await this.changeStatus.execute(principal, { id, to: body.status });
    return this.presenter.detail(await this.getEstablishment.execute(principal, id));
  }

  // ─────────────── Categorías (solo administrador) ───────────────

  @Get('categories')
  @RequirePermissions(CATEGORIES_MANAGE)
  listCategories() {
    return this.categories.list();
  }

  @Post('categories')
  @RequirePermissions(CATEGORIES_MANAGE)
  async createCategory(@CurrentPrincipal() principal: Principal, @Body() body: CategoryDto) {
    return { id: await this.categories.create(principal, body) };
  }

  @Put('categories/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(CATEGORIES_MANAGE)
  async reorderCategories(@Body() body: CategoryOrderDto) {
    await this.categories.reorder(body.ids);
  }

  @Put('categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(CATEGORIES_MANAGE)
  async updateCategory(@CurrentPrincipal() principal: Principal, @Param('categoryId', ParseIntPipe) id: number, @Body() body: CategoryDto) {
    await this.categories.update(principal, id, body);
  }

  @Post('categories/:categoryId/active')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(CATEGORIES_MANAGE)
  async categoryActive(@CurrentPrincipal() principal: Principal, @Param('categoryId', ParseIntPipe) id: number, @Body() body: CategoryActiveDto) {
    await this.categories.setActive(principal, id, body.active);
  }
}

/**
 * Menú (H02.2) y fotos (H02.3). Lo usan el panel y, desde E15, el comercio aliado en su portal: el rol MERCHANT solo
 * llega a los locales que atiende (MenuAccess lo verifica con establishment_staff y el convenio vigente; si no, 404).
 */
@Controller('admin')
@Roles(ROLES.ADMIN, ROLES.OPERATOR, ROLES.MERCHANT)
export class AdminMenuController {
  constructor(
    private readonly getMenu: GetMenuAdminUseCase,
    private readonly sections: ManageSectionsUseCase,
    private readonly products: ManageProductsUseCase,
    private readonly images: ManageProductImagesUseCase,
    private readonly presenter: CatalogPresenter,
  ) {}

  // ─────────────── Menú ───────────────

  @Get('establishments/:id/menu')
  @RequirePermissions(PRODUCTS_MANAGE)
  async menu(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.presenter.menu(await this.getMenu.execute(principal, id));
  }

  @Post('establishments/:id/sections')
  @RequirePermissions(PRODUCTS_MANAGE)
  async createSection(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: SectionDto) {
    return { id: await this.sections.create(principal, id, body.names) };
  }

  @Put('establishments/:id/sections/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PRODUCTS_MANAGE)
  async reorderSections(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: OrderDto) {
    await this.sections.reorder(principal, id, body.ids);
  }

  @Put('sections/:sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PRODUCTS_MANAGE)
  async renameSection(@CurrentPrincipal() principal: Principal, @Param('sectionId', ParseUUIDPipe) sectionId: string, @Body() body: SectionDto) {
    await this.sections.rename(principal, sectionId, body.names);
  }

  @Delete('sections/:sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PRODUCTS_MANAGE)
  async removeSection(@CurrentPrincipal() principal: Principal, @Param('sectionId', ParseUUIDPipe) sectionId: string) {
    await this.sections.remove(principal, sectionId);
  }

  @Put('sections/:sectionId/products/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PRODUCTS_MANAGE)
  async reorderProducts(@CurrentPrincipal() principal: Principal, @Param('sectionId', ParseUUIDPipe) sectionId: string, @Body() body: OrderDto) {
    await this.products.reorder(principal, sectionId, body.ids);
  }

  @Post('establishments/:id/products')
  @RequirePermissions(PRODUCTS_MANAGE)
  async createProduct(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: ProductDto) {
    return { id: await this.products.create(principal, id, body) };
  }

  @Put('products/:productId')
  @RequirePermissions(PRODUCTS_MANAGE)
  updateProduct(@CurrentPrincipal() principal: Principal, @Param('productId', ParseUUIDPipe) productId: string, @Body() body: ProductDto) {
    return this.products.update(principal, productId, body);
  }

  @Post('products/:productId/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PRODUCTS_MANAGE)
  async productStatus(@CurrentPrincipal() principal: Principal, @Param('productId', ParseUUIDPipe) productId: string, @Body() body: ProductStatusDto) {
    await this.products.changeStatus(principal, productId, body.status);
  }

  @Get('products/:productId/versions')
  @RequirePermissions(PRODUCTS_MANAGE)
  versions(@CurrentPrincipal() principal: Principal, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.products.versions(principal, productId);
  }

  @Post('products/:productId/images')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PRODUCTS_MANAGE)
  async addImage(@CurrentPrincipal() principal: Principal, @Param('productId', ParseUUIDPipe) productId: string, @Body() body: ProductImageDto) {
    await this.images.add(principal, productId, body.fileId);
  }

  @Post('products/:productId/images/:fileId/primary')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PRODUCTS_MANAGE)
  async primaryImage(
    @CurrentPrincipal() principal: Principal,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    await this.images.makePrimary(principal, productId, fileId);
  }

  @Delete('products/:productId/images/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PRODUCTS_MANAGE)
  async removeImage(
    @CurrentPrincipal() principal: Principal,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    await this.images.remove(principal, productId, fileId);
  }
}
