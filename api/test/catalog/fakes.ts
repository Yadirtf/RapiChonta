import { EstablishmentStatusCode, ProductStatusCode } from '../../src/modules/catalog/domain/catalog.codes';
import {
  EstablishmentAdminRepository,
  EstablishmentData,
  EstablishmentDetail,
  EstablishmentSummary,
} from '../../src/modules/catalog/domain/ports/establishment-admin.repository';
import { AdminMenu, MenuRepository, ProductState, ProductVersionEntry } from '../../src/modules/catalog/domain/ports/menu.repository';
import { ProductText, Translations } from '../../src/modules/catalog/domain/value-objects/localized-text';
import { Price } from '../../src/modules/catalog/domain/value-objects/price';
import { Principal } from '../../src/modules/identity/domain/principal';

/** Dobles en memoria de los puertos de catalog: los casos de uso se prueban sin base de datos. */

export const admin: Principal = {
  userId: 'admin-1',
  sessionId: 's-1',
  role: 'ADMIN',
  permissions: new Set(['establishments.manage', 'products.manage', 'categories.manage']),
  municipalityId: null,
};
export const operatorOf = (municipalityId: number): Principal => ({ ...admin, userId: `op-${municipalityId}`, role: 'OPERATOR', municipalityId });

const ESTABLISHMENT_TRANSITIONS = ['DRAFT>ACTIVE', 'DRAFT>INACTIVE', 'ACTIVE>TEMPORARILY_CLOSED', 'TEMPORARILY_CLOSED>ACTIVE', 'ACTIVE>INACTIVE', 'TEMPORARILY_CLOSED>INACTIVE', 'INACTIVE>ACTIVE'];
const PRODUCT_TRANSITIONS = ['AVAILABLE>SOLD_OUT', 'SOLD_OUT>AVAILABLE', 'AVAILABLE>DISCONTINUED', 'SOLD_OUT>DISCONTINUED'];

export class InMemoryEstablishments extends EstablishmentAdminRepository {
  readonly rows = new Map<string, EstablishmentData & { status: EstablishmentStatusCode }>();
  readonly files = new Map<string, string>();
  orderable = new Map<string, number>();
  categories = ['FAST_FOOD', 'RESTAURANT', 'PHARMACY'];
  boundaryCovers = true;
  private seq = 0;

  async list(): Promise<EstablishmentSummary[]> {
    return [];
  }
  async findById(id: string): Promise<EstablishmentDetail | null> {
    const row = this.rows.get(id);
    return row ? ({ id, municipality: { id: row.municipalityId, name: 'M' } } as EstablishmentDetail) : null;
  }
  async scopeOf(id: string) {
    const row = this.rows.get(id);
    return row ? { municipalityId: row.municipalityId, status: row.status } : null;
  }
  /** E15: `${userId}:${establishmentId}` de quien atiende cada local. */
  staff = new Set<string>();
  async servedBy(id: string, userId: string) {
    return this.staff.has(`${userId}:${id}`);
  }
  async create(data: EstablishmentData): Promise<string> {
    const id = `e-${++this.seq}`;
    this.rows.set(id, { ...data, status: 'DRAFT' });
    return id;
  }
  async update(id: string, data: EstablishmentData): Promise<void> {
    this.rows.set(id, { ...data, status: this.rows.get(id)!.status });
  }
  async isTransitionAllowed(from: EstablishmentStatusCode, to: EstablishmentStatusCode) {
    return ESTABLISHMENT_TRANSITIONS.includes(`${from}>${to}`);
  }
  async changeStatus(input: { id: string; to: EstablishmentStatusCode }) {
    this.rows.get(input.id)!.status = input.to;
  }
  async countOrderableProducts(id: string) {
    return this.orderable.get(id) ?? 0;
  }
  async nameTaken(municipalityId: number, name: string, exceptId?: string) {
    return [...this.rows.entries()].some(([id, r]) => id !== exceptId && r.municipalityId === municipalityId && r.name.toLowerCase() === name.toLowerCase());
  }
  async activeCategoryCodes(codes: string[]) {
    return codes.filter((c) => this.categories.includes(c));
  }
  async municipality(id: number) {
    return [1, 2].includes(id) ? { id, covers: this.boundaryCovers } : null;
  }
  async municipalities(scope: number | null) {
    return [{ id: 1, name: 'Villagarzón', center: { lat: 1.03, lng: -76.6 }, launched: true }].filter((m) => scope === null || m.id === scope);
  }
  async fileIsUsableAs(fileId: string, purpose: string) {
    return this.files.get(fileId) === purpose;
  }
}

export class InMemoryMenu extends MenuRepository {
  readonly sections = new Map<string, { establishmentId: string; names: Translations<string>; active: boolean }>();
  readonly products = new Map<string, ProductState & { versions: number }>();
  private seq = 0;

  async menu(establishmentId: string): Promise<AdminMenu> {
    return { establishmentId, sections: [], discontinued: [] };
  }
  async section(id: string) {
    const s = this.sections.get(id);
    if (!s?.active) return null;
    const liveProducts = [...this.products.values()].filter((p) => p.sectionId === id && p.status !== 'DISCONTINUED').length;
    return { id, establishmentId: s.establishmentId, liveProducts };
  }
  async createSection(establishmentId: string, names: Translations<string>) {
    const id = `s-${++this.seq}`;
    this.sections.set(id, { establishmentId, names, active: true });
    return id;
  }
  async renameSection(id: string, names: Translations<string>) {
    this.sections.get(id)!.names = names;
  }
  async deactivateSection(id: string) {
    this.sections.get(id)!.active = false;
  }
  async sectionIds(establishmentId: string) {
    return [...this.sections.entries()].filter(([, s]) => s.establishmentId === establishmentId && s.active).map(([id]) => id);
  }
  async reorderSections() {}
  async product(id: string) {
    return this.products.get(id) ?? null;
  }
  async createProduct(input: { establishmentId: string; sectionId: string; price: Price; prepMinutes: number; texts: Translations<ProductText> }) {
    const id = `p-${++this.seq}`;
    this.products.set(id, { id, ...input, status: 'AVAILABLE', imageFileIds: [], versions: 1 });
    return id;
  }
  async updateProduct(input: { id: string; sectionId?: string; version?: { price: Price; prepMinutes: number; texts: Translations<ProductText> } }) {
    const p = this.products.get(input.id)!;
    if (input.sectionId) p.sectionId = input.sectionId;
    if (input.version) Object.assign(p, input.version, { versions: p.versions + 1 });
  }
  async isTransitionAllowed(from: ProductStatusCode, to: ProductStatusCode) {
    return PRODUCT_TRANSITIONS.includes(`${from}>${to}`);
  }
  async changeProductStatus(input: { id: string; to: ProductStatusCode }) {
    this.products.get(input.id)!.status = input.to;
  }
  async productIds(sectionId: string) {
    return [...this.products.values()].filter((p) => p.sectionId === sectionId && p.status !== 'DISCONTINUED').map((p) => p.id);
  }
  async reorderProducts() {}
  async addImage(productId: string, fileId: string) {
    this.products.get(productId)!.imageFileIds.push(fileId);
  }
  async removeImage(productId: string, fileId: string) {
    const p = this.products.get(productId)!;
    const before = p.imageFileIds.length;
    p.imageFileIds = p.imageFileIds.filter((f) => f !== fileId);
    return p.imageFileIds.length < before;
  }
  async makeImagePrimary(productId: string, fileId: string) {
    const p = this.products.get(productId)!;
    if (!p.imageFileIds.includes(fileId)) return false;
    p.imageFileIds = [fileId, ...p.imageFileIds.filter((f) => f !== fileId)];
    return true;
  }
  async versions(): Promise<ProductVersionEntry[]> {
    return [];
  }
}
