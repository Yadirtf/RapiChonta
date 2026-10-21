import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { writeAudit } from '../../../../shared/infrastructure/prisma/audit';
import { CatalogIds } from '../../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { CATALOG_AUDIT_ACTIONS } from '../../domain/catalog.codes';
import { AdminCategory, CategoryRepository } from '../../domain/ports/category.repository';
import { Translations } from '../../domain/value-objects/localized-text';

type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaCategoryRepository extends CategoryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async list(): Promise<AdminCategory[]> {
    const rows = await this.prisma.establishmentCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { translations: { include: { language: { select: { code: true } } } }, _count: { select: { links: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      icon: c.icon,
      names: Object.fromEntries(c.translations.map((t) => [t.language.code, t.name])) as Translations<string>,
      sortOrder: c.sortOrder,
      active: c.deactivatedAt === null,
      establishmentCount: c._count.links,
    }));
  }

  async find(id: number): Promise<AdminCategory | null> {
    return (await this.list()).find((c) => c.id === id) ?? null;
  }

  async codeExists(code: string): Promise<boolean> {
    return (await this.prisma.establishmentCategory.count({ where: { code } })) > 0;
  }

  async create(input: { code: string; icon: string; names: Translations<string>; actorUserId: string }): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const { _max } = await tx.establishmentCategory.aggregate({ _max: { sortOrder: true } });
      const category = await tx.establishmentCategory.create({ data: { code: input.code, icon: input.icon, sortOrder: (_max.sortOrder ?? 0) + 1 } });
      await this.writeNames(tx, category.id, input.names);
      await this.audit(tx, input.actorUserId, category.id, { created: { code: input.code, names: input.names } });
      return category.id;
    });
  }

  async update(input: { id: number; icon: string; names: Translations<string>; actorUserId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.establishmentCategory.update({ where: { id: input.id }, data: { icon: input.icon } });
      await tx.establishmentCategoryTranslation.deleteMany({ where: { categoryId: input.id } });
      await this.writeNames(tx, input.id, input.names);
      await this.audit(tx, input.actorUserId, input.id, { icon: input.icon, names: input.names });
    });
  }

  async setActive(input: { id: number; active: boolean; actorUserId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.establishmentCategory.update({ where: { id: input.id }, data: { deactivatedAt: input.active ? null : new Date() } });
      await this.audit(tx, input.actorUserId, input.id, { active: input.active });
    });
  }

  async isPrimaryOfVisibleEstablishment(id: number): Promise<boolean> {
    const count = await this.prisma.establishmentCategoryLink.count({
      where: { categoryId: id, isPrimary: true, establishment: { status: { isVisibleOnMap: true } } },
    });
    return count > 0;
  }

  async reorder(ids: number[]): Promise<void> {
    await this.prisma.$transaction(ids.map((id, index) => this.prisma.establishmentCategory.update({ where: { id }, data: { sortOrder: index + 1 } })));
  }

  private async writeNames(tx: Tx, categoryId: number, names: Translations<string>): Promise<void> {
    for (const [language, name] of Object.entries(names)) {
      await tx.establishmentCategoryTranslation.create({ data: { categoryId, languageId: await this.ids.of('languages', language, tx), name: name! } });
    }
  }

  private audit(tx: Tx, actorUserId: string, id: number, changes: Prisma.InputJsonValue) {
    return writeAudit(tx, { actorUserId, action: CATALOG_AUDIT_ACTIONS.CATEGORY_CHANGED, entityTable: 'establishment_categories', entityId: String(id), changes });
  }
}
