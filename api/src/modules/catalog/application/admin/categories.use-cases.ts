import { Injectable } from '@nestjs/common';
import { Principal } from '../../../identity/domain/principal';
import { CatalogErrors } from '../../domain/catalog.errors';
import { AdminCategory, CategoryRepository } from '../../domain/ports/category.repository';
import { CATEGORY_ICONS, categoryCode } from '../../domain/value-objects/category-code';
import { normalizeNames, Translations } from '../../domain/value-objects/localized-text';

const iconOf = (icon: string | undefined) => ((CATEGORY_ICONS as readonly string[]).includes(icon ?? '') ? icon! : 'store');

/**
 * Categorías de establecimiento (H02.4, RF-12): catálogo del negocio que el administrador amplía desde el
 * panel. El código no cambia nunca (la web y la app filtran por él); nombre e ícono sí.
 */
@Injectable()
export class ManageCategoriesUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  list(): Promise<AdminCategory[]> {
    return this.categories.list();
  }

  async create(principal: Principal, input: { code?: string; icon?: string; names: Translations<string> }): Promise<number> {
    const names = normalizeNames(input.names, 80);
    const code = categoryCode(input.code?.trim() || names.es!);
    if (await this.categories.codeExists(code)) throw CatalogErrors.categoryCodeTaken();
    return this.categories.create({ code, icon: iconOf(input.icon), names, actorUserId: principal.userId });
  }

  async update(principal: Principal, id: number, input: { icon?: string; names: Translations<string> }): Promise<void> {
    if (!(await this.categories.find(id))) throw CatalogErrors.categoryNotFound();
    await this.categories.update({ id, icon: iconOf(input.icon), names: normalizeNames(input.names, 80), actorUserId: principal.userId });
  }

  async setActive(principal: Principal, id: number, active: boolean): Promise<void> {
    const category = await this.categories.find(id);
    if (!category) throw CatalogErrors.categoryNotFound();
    if (category.active === active) return;
    if (!active && (await this.categories.isPrimaryOfVisibleEstablishment(id))) throw CatalogErrors.categoryInUse();
    await this.categories.setActive({ id, active, actorUserId: principal.userId });
  }

  async reorder(ids: number[]): Promise<void> {
    const current = (await this.categories.list()).map((c) => c.id);
    if (current.length !== ids.length || new Set(ids).size !== ids.length || !ids.every((id) => current.includes(id))) throw CatalogErrors.invalidOrder();
    await this.categories.reorder(ids);
  }
}
