import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { ConflictError } from '../../../../shared/domain/domain.error';
import { writeAudit } from '../../../../shared/infrastructure/prisma/audit';
import { CatalogIds } from '../../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { CATALOG_AUDIT_ACTIONS, ContentLanguage, PRODUCT_STATUSES, ProductStatusCode } from '../../domain/catalog.codes';
import { AdminMenu, AdminMenuProduct, MenuRepository, ProductState, ProductVersionEntry } from '../../domain/ports/menu.repository';
import { ProductText, Translations } from '../../domain/value-objects/localized-text';
import { Price } from '../../domain/value-objects/price';

type Tx = Prisma.TransactionClient;

const PRODUCT_INCLUDE = {
  status: { select: { code: true, isVisible: true } },
  images: { orderBy: [{ sortOrder: 'asc' }, { fileId: 'asc' }], select: { fileId: true } },
  versions: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: { texts: { include: { language: { select: { code: true } } } } },
  },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

const textsOf = (version: ProductRow['versions'][number]): Translations<ProductText> =>
  Object.fromEntries(version.texts.map((t) => [t.language.code, { name: t.name, description: t.description }])) as Translations<ProductText>;

const toAdminProduct = (p: ProductRow): AdminMenuProduct => {
  const version = p.versions[0];
  return {
    id: p.id,
    sectionId: p.menuSectionId,
    status: p.status.code as ProductStatusCode,
    sortOrder: p.sortOrder,
    versionId: version.id,
    price: version.price.toFixed(2),
    prepMinutes: version.prepMinutes,
    texts: textsOf(version),
    imageFileIds: p.images.map((i) => i.fileId),
    updatedAt: version.createdAt,
  };
};

@Injectable()
export class PrismaMenuRepository extends MenuRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async menu(establishmentId: string): Promise<AdminMenu> {
    const [sections, products] = await Promise.all([
      this.prisma.menuSection.findMany({
        where: { establishmentId, deactivatedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { translations: { include: { language: { select: { code: true } } } } },
      }),
      this.prisma.product.findMany({ where: { establishmentId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: PRODUCT_INCLUDE }),
    ]);
    const live = products.filter((p) => p.status.isVisible && p.versions.length);
    return {
      establishmentId,
      sections: sections.map((s) => ({
        id: s.id,
        names: Object.fromEntries(s.translations.map((t) => [t.language.code, t.name])) as Translations<string>,
        sortOrder: s.sortOrder,
        products: live.filter((p) => p.menuSectionId === s.id).map(toAdminProduct),
      })),
      discontinued: products.filter((p) => !p.status.isVisible && p.versions.length).map(toAdminProduct),
    };
  }

  // ─────────────── Secciones ───────────────

  async section(id: string) {
    const section = await this.prisma.menuSection.findFirst({ where: { id, deactivatedAt: null }, select: { id: true, establishmentId: true } });
    if (!section) return null;
    const liveProducts = await this.prisma.product.count({ where: { menuSectionId: id, status: { isVisible: true } } });
    return { ...section, liveProducts };
  }

  async createSection(establishmentId: string, names: Translations<string>): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const { _max } = await tx.menuSection.aggregate({ where: { establishmentId }, _max: { sortOrder: true } });
      const section = await tx.menuSection.create({ data: { establishmentId, sortOrder: (_max.sortOrder ?? 0) + 1 } });
      await this.writeSectionNames(tx, section.id, names);
      return section.id;
    });
  }

  async renameSection(id: string, names: Translations<string>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.menuSectionTranslation.deleteMany({ where: { menuSectionId: id } });
      await this.writeSectionNames(tx, id, names);
    });
  }

  private async writeSectionNames(tx: Tx, sectionId: string, names: Translations<string>): Promise<void> {
    for (const [language, name] of Object.entries(names)) {
      await tx.menuSectionTranslation.create({ data: { menuSectionId: sectionId, languageId: await this.ids.of('languages', language, tx), name: name! } });
    }
  }

  async deactivateSection(id: string): Promise<void> {
    await this.prisma.menuSection.update({ where: { id }, data: { deactivatedAt: new Date() } });
  }

  async sectionIds(establishmentId: string): Promise<string[]> {
    const rows = await this.prisma.menuSection.findMany({ where: { establishmentId, deactivatedAt: null }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async reorderSections(establishmentId: string, ids: string[]): Promise<void> {
    await this.prisma.$transaction(ids.map((id, index) => this.prisma.menuSection.updateMany({ where: { id, establishmentId }, data: { sortOrder: index + 1 } })));
  }

  // ─────────────── Productos ───────────────

  async product(id: string): Promise<ProductState | null> {
    const p = await this.prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    if (!p || !p.versions.length) return null;
    const version = p.versions[0];
    return {
      id: p.id,
      establishmentId: p.establishmentId,
      sectionId: p.menuSectionId,
      status: p.status.code as ProductStatusCode,
      price: Price.parse(version.price.toFixed(2)),
      prepMinutes: version.prepMinutes,
      texts: textsOf(version),
      imageFileIds: p.images.map((i) => i.fileId),
    };
  }

  async createProduct(input: {
    establishmentId: string;
    sectionId: string;
    price: Price;
    prepMinutes: number;
    texts: Translations<ProductText>;
    actorUserId: string;
  }): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const { _max } = await tx.product.aggregate({ where: { menuSectionId: input.sectionId }, _max: { sortOrder: true } });
      const product = await tx.product.create({
        data: {
          establishmentId: input.establishmentId,
          menuSectionId: input.sectionId,
          statusId: await this.ids.of('product_statuses', PRODUCT_STATUSES.AVAILABLE, tx),
          sortOrder: (_max.sortOrder ?? 0) + 1,
          createdByUserId: input.actorUserId,
        },
      });
      await this.writeVersion(tx, product.id, input);
      await writeAudit(tx, {
        actorUserId: input.actorUserId,
        action: CATALOG_AUDIT_ACTIONS.PRODUCT_CHANGED,
        entityTable: 'products',
        entityId: product.id,
        changes: { created: { name: input.texts.es?.name ?? null, price: input.price.toDecimalString() } },
      });
      return product.id;
    });
  }

  async updateProduct(input: {
    id: string;
    sectionId?: string;
    version?: { price: Price; prepMinutes: number; texts: Translations<ProductText> };
    actorUserId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const changes: Record<string, unknown> = {};
      if (input.sectionId) {
        const { _max } = await tx.product.aggregate({ where: { menuSectionId: input.sectionId }, _max: { sortOrder: true } });
        await tx.product.update({ where: { id: input.id }, data: { menuSectionId: input.sectionId, sortOrder: (_max.sortOrder ?? 0) + 1 } });
        changes.section = input.sectionId;
      }
      if (input.version) {
        const versionId = await this.writeVersion(tx, input.id, { ...input.version, actorUserId: input.actorUserId });
        changes.version = { id: versionId, price: input.version.price.toDecimalString(), prepMinutes: input.version.prepMinutes };
      }
      await writeAudit(tx, {
        actorUserId: input.actorUserId,
        action: CATALOG_AUDIT_ACTIONS.PRODUCT_CHANGED,
        entityTable: 'products',
        entityId: input.id,
        changes: changes as Prisma.InputJsonValue,
      });
    });
  }

  /** Versión inmutable + sus textos por idioma en la misma transacción (el disparador exige el español). */
  private async writeVersion(
    tx: Tx,
    productId: string,
    input: { price: Price; prepMinutes: number; texts: Translations<ProductText>; actorUserId: string },
  ): Promise<string> {
    const version = await tx.productVersion.create({
      data: { productId, price: new Prisma.Decimal(input.price.toDecimalString()), prepMinutes: input.prepMinutes, createdByUserId: input.actorUserId },
    });
    for (const [language, text] of Object.entries(input.texts) as [ContentLanguage, ProductText][]) {
      await tx.productVersionText.create({
        data: { productVersionId: version.id, languageId: await this.ids.of('languages', language, tx), name: text.name, description: text.description },
      });
    }
    return version.id;
  }

  async isTransitionAllowed(from: ProductStatusCode, to: ProductStatusCode): Promise<boolean> {
    const count = await this.prisma.productStatusTransition.count({
      where: { fromStatus: { code: from }, toStatus: { code: to, deactivatedAt: null } },
    });
    return count > 0;
  }

  async changeProductStatus(input: { id: string; from: ProductStatusCode; to: ProductStatusCode; actorUserId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.product.updateMany({
        where: { id: input.id, statusId: await this.ids.of('product_statuses', input.from, tx) },
        data: { statusId: await this.ids.of('product_statuses', input.to, tx) },
      });
      if (count !== 1) throw new ConflictError('STATUS_CONFLICT', 'La disponibilidad cambió mientras tanto');
      await writeAudit(tx, {
        actorUserId: input.actorUserId,
        action: CATALOG_AUDIT_ACTIONS.PRODUCT_CHANGED,
        entityTable: 'products',
        entityId: input.id,
        changes: { status: { from: input.from, to: input.to } },
      });
    });
  }

  async productIds(sectionId: string): Promise<string[]> {
    const rows = await this.prisma.product.findMany({ where: { menuSectionId: sectionId, status: { isVisible: true } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async reorderProducts(sectionId: string, ids: string[]): Promise<void> {
    await this.prisma.$transaction(ids.map((id, index) => this.prisma.product.updateMany({ where: { id, menuSectionId: sectionId }, data: { sortOrder: index + 1 } })));
  }

  // ─────────────── Fotos ───────────────

  async addImage(productId: string, fileId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { _max } = await tx.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } });
      await tx.productImage.create({ data: { productId, fileId, sortOrder: (_max.sortOrder ?? 0) + 1 } });
    });
  }

  async removeImage(productId: string, fileId: string): Promise<boolean> {
    const { count } = await this.prisma.productImage.deleteMany({ where: { productId, fileId } });
    return count === 1;
  }

  /** La elegida pasa a orden 0 y las demás se renumeran detrás, en su orden actual. */
  async makeImagePrimary(productId: string, fileId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const images = await tx.productImage.findMany({ where: { productId }, orderBy: [{ sortOrder: 'asc' }, { fileId: 'asc' }] });
      if (!images.some((i) => i.fileId === fileId)) return false;
      const ordered = [fileId, ...images.map((i) => i.fileId).filter((id) => id !== fileId)];
      for (const [index, id] of ordered.entries()) {
        await tx.productImage.update({ where: { productId_fileId: { productId, fileId: id } }, data: { sortOrder: index } });
      }
      return true;
    });
  }

  async versions(productId: string): Promise<ProductVersionEntry[]> {
    const versions = await this.prisma.productVersion.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        texts: { where: { language: { code: 'es' } } },
        createdBy: { select: { person: { select: { givenNames: true, familyNames: true } } } },
      },
    });
    return versions.map((v) => ({
      id: v.id,
      price: v.price.toFixed(2),
      prepMinutes: v.prepMinutes,
      name: v.texts[0]?.name ?? '',
      createdAt: v.createdAt,
      createdBy: v.createdBy?.person ? [v.createdBy.person.givenNames, v.createdBy.person.familyNames].filter(Boolean).join(' ') : null,
    }));
  }
}
