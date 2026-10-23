import { randomUUID } from 'node:crypto';
import { GeoPoint } from '../../src/modules/catalog/domain/value-objects/geo-point';
import { Principal } from '../../src/modules/identity/domain/principal';
import { CustomerExposure, MenuVersion } from '../../src/modules/orders/domain/checkout';
import { AddressBook, NewAddress, RecipientBook, SavedAddress, SavedRecipient } from '../../src/modules/orders/domain/ports/address-book';
import { CheckoutReader, OrderingEstablishment } from '../../src/modules/orders/domain/ports/checkout.reader';
import { ClientRequestReplayed, NewOrder, OrderCodeTaken, OrderDetail, OrdersRepository, OrderSummary } from '../../src/modules/orders/domain/ports/orders.repository';

/** Dobles en memoria de los puertos de pedidos: los casos de uso se prueban sin base de datos. */

export const customer: Principal = {
  userId: 'cliente-1',
  sessionId: 's-1',
  role: 'CUSTOMER',
  permissions: new Set(['orders.create', 'orders.read_own']),
  municipalityId: null,
};

export const ESTABLISHMENT: OrderingEstablishment = { id: 'local-1', name: 'Asadero La Chonta', municipalityId: 1, acceptsOrders: true };

/** Producto vigente del menú: la versión que envía el cliente es la actual. */
export const version = (id: string, price: string, overrides: Partial<MenuVersion> = {}): MenuVersion => ({
  versionId: id,
  productId: `p-${id}`,
  establishmentId: ESTABLISHMENT.id,
  orderable: true,
  current: { versionId: id, name: `Producto ${id}`, price, prepMinutes: 15 },
  ...overrides,
});

export class MemoryCheckoutReader extends CheckoutReader {
  establishments = new Map([[ESTABLISHMENT.id, ESTABLISHMENT]]);
  menu: MenuVersion[] = [];
  exposureValue: CustomerExposure = { deliveredOrders: 0, activeItemsCents: 0 };
  limit: string | null = '100000.00';
  commission: string | null = 'comision-1';
  methods = ['CASH', 'NEQUI', 'DAVIPLATA', 'BANK_TRANSFER'];

  async establishment(id: string) {
    return this.establishments.get(id) ?? null;
  }
  async menuVersions(ids: string[]) {
    return this.menu.filter((m) => ids.includes(m.versionId));
  }
  async exposure() {
    return this.exposureValue;
  }
  async newCustomerLimit() {
    return this.limit;
  }
  async commissionRateId() {
    return this.commission;
  }
  async paymentMethods() {
    return this.methods;
  }
}

export class MemoryAddressBook extends AddressBook {
  rows: (SavedAddress & { owner: string; archived: boolean })[] = [];
  /** Direcciones de los pedidos, del más viejo al más nuevo. */
  used: string[] = [];

  async list(owner: string) {
    return this.rows.filter((a) => a.owner === owner && !a.archived && a.label).sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }
  async find(owner: string, id: string) {
    return this.rows.find((a) => a.owner === owner && a.id === id && !a.archived) ?? null;
  }
  async lastUsed(owner: string) {
    for (const id of [...this.used].reverse()) {
      const row = await this.find(owner, id);
      if (row) return row;
    }
    return null;
  }
  async create(owner: string, data: NewAddress) {
    const same = this.rows.find((a) => a.owner === owner && !a.archived && a.label && data.label && a.label.toLowerCase() === data.label.toLowerCase());
    if (same) same.archived = true;
    const isDefault = !!data.label && (same?.isDefault || !this.rows.some((a) => a.owner === owner && !a.archived && a.isDefault));
    if (same) same.isDefault = false;
    const row = { ...data, id: randomUUID(), owner, archived: false, isDefault, createdAt: new Date() };
    this.rows.push(row);
    return row;
  }
  async archive(owner: string, id: string) {
    const row = this.rows.find((a) => a.owner === owner && a.id === id && !a.archived && a.label);
    if (!row) return false;
    row.archived = true;
    return true;
  }
  async setDefault(owner: string, id: string) {
    const row = this.rows.find((a) => a.owner === owner && a.id === id && !a.archived && a.label);
    if (!row) return false;
    this.rows.filter((a) => a.owner === owner).forEach((a) => (a.isDefault = a === row));
    return true;
  }
}

export class MemoryRecipientBook extends RecipientBook {
  rows: (SavedRecipient & { owner: string; archived: boolean })[] = [];
  async list(owner: string) {
    return this.rows.filter((r) => r.owner === owner && !r.archived);
  }
  async find(owner: string, id: string) {
    return this.rows.find((r) => r.owner === owner && r.id === id && !r.archived) ?? null;
  }
  async archive(owner: string, id: string) {
    const row = this.rows.find((r) => r.owner === owner && r.id === id && !r.archived);
    if (row) row.archived = true;
    return !!row;
  }
}

export class MemoryOrders extends OrdersRepository {
  created: NewOrder[] = [];
  /** Códigos que "ya existen": el caso de uso debe reintentar con otro. */
  taken = new Set<string>();
  summaries: (OrderSummary & { customer: string })[] = [];
  details = new Map<string, OrderDetail & { customer: string }>();

  async create(order: NewOrder) {
    if (this.taken.has(order.code)) throw new OrderCodeTaken();
    const previous = this.created.find((o) => o.clientRequestId === order.clientRequestId);
    if (previous) throw new ClientRequestReplayed({ code: previous.code, customerUserId: previous.customerUserId });
    this.created.push(order);
  }
  async findByClientRequest(id: string) {
    const o = this.created.find((c) => c.clientRequestId === id);
    return o ? { code: o.code, customerUserId: o.customerUserId } : null;
  }
  async listMine(customerUserId: string, query: { active: boolean; before?: Date; limit: number }) {
    return this.summaries
      .filter((o) => o.customer === customerUserId && o.status.terminal !== query.active && (!query.before || o.createdAt < query.before))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, query.limit);
  }
  async findMine(customerUserId: string, code: string) {
    const o = this.details.get(code);
    return o && o.customer === customerUserId ? o : null;
  }
  async journey() {
    return ['PENDING_ASSIGNMENT', 'ACCEPTED', 'AT_ESTABLISHMENT', 'PREPARING', 'ON_THE_WAY', 'ARRIVING', 'DELIVERED'];
  }
}

export const VILLAGARZON = GeoPoint.create(1.0294, -76.6165);
