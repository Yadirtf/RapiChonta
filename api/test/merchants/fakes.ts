import { Principal } from '../../src/modules/identity/domain/principal';
import { CounterOrder, MerchantActor, MerchantDesk, MerchantResult, MerchantStore } from '../../src/modules/merchants/domain/ports/merchant-desk';
import { Partnership, PartnershipRefusal, PartnershipView, Partnerships } from '../../src/modules/merchants/domain/ports/partnerships';

/** Dobles en memoria de los puertos del comercio aliado: los casos de uso se prueban sin base de datos. */

export const admin: Principal = { userId: 'admin-1', sessionId: 's-1', role: 'ADMIN', permissions: new Set(['partners.manage']), municipalityId: null };
export const merchant: Principal = {
  userId: 'tendero-1',
  sessionId: 's-2',
  role: 'MERCHANT',
  permissions: new Set(['store.respond_orders', 'store.manage_status', 'products.manage']),
  municipalityId: null,
};

export class InMemoryPartnerships extends Partnerships {
  today = '2026-10-30';
  readonly rows: Partnership[] = [];
  readonly members: { staffId: string; userId: string }[] = [];
  readonly merchantsByPhone = new Map<string, string>();
  private seq = 0;

  async view(establishmentId: string): Promise<PartnershipView | null> {
    if (establishmentId !== 'tienda-1') return null;
    const covers = (p: Partnership) => p.startedOn <= this.today && (p.endedOn === null || p.endedOn > this.today);
    return {
      establishment: { id: establishmentId, name: 'Tienda Doña Rosa', municipalityId: 1, today: this.today },
      current: this.rows.find(covers) ?? null,
      upcoming: this.rows.find((p) => p.startedOn > this.today && p.endedOn !== p.startedOn) ?? null,
      past: this.rows.filter((p) => p.endedOn !== null && p.endedOn <= this.today),
      members: this.members.map((m) => ({ ...m, givenNames: 'Rosa', familyNames: null, phone: null, grantedAt: new Date(), lastSignInAt: null })),
    };
  }
  async start(input: { establishmentId: string; startedOn: string; endedOn: string | null }): Promise<PartnershipRefusal | null> {
    if (this.rows.some((p) => p.endedOn === null || p.endedOn > input.startedOn)) return 'ACTIVE';
    this.rows.push({ id: `p-${++this.seq}`, startedOn: input.startedOn, endedOn: input.endedOn, agreementFileId: null, createdAt: new Date(), createdBy: 'Admin' });
    return null;
  }
  async end(input: { endedOn: string }): Promise<PartnershipRefusal | null> {
    const open = this.rows.find((p) => p.endedOn === null);
    if (!open) return 'NONE';
    open.endedOn = input.endedOn < open.startedOn ? open.startedOn : input.endedOn;
    return null;
  }
  async merchantByPhone(phone: string) {
    const userId = this.merchantsByPhone.get(phone);
    return userId ? { userId } : null;
  }
  async addMember(input: { userId: string }): Promise<PartnershipRefusal | null> {
    if (this.members.some((m) => m.userId === input.userId)) return 'STAFF_EXISTS';
    this.members.push({ staffId: `st-${++this.seq}`, userId: input.userId });
    return null;
  }
  async revokeMember(input: { staffId: string }): Promise<PartnershipRefusal | null> {
    const index = this.members.findIndex((m) => m.staffId === input.staffId);
    if (index < 0) return 'STAFF_NOT_FOUND';
    this.members.splice(index, 1);
    return null;
  }
}

/** El mostrador: pedidos por código con su estado, y quién atiende qué local. */
export class InMemoryMerchantDesk extends MerchantDesk {
  readonly served = new Set<string>(['tendero-1:tienda-1']);
  readonly orders = new Map<string, { establishmentId: string; status: string; minutes?: number; ready?: boolean }>();
  readonly calls: string[] = [];

  async stores(): Promise<MerchantStore[]> {
    return [];
  }
  async counter(userId: string, establishmentId: string): Promise<CounterOrder[] | null> {
    if (!this.served.has(`${userId}:${establishmentId}`)) return null;
    return [...this.orders.entries()]
      .filter(([, o]) => o.establishmentId === establishmentId)
      .map(([code, o]) => ({
        id: code,
        code,
        status: o.status,
        terminal: o.status === 'CANCELLED',
        createdAt: new Date(),
        closedAt: null,
        acceptedAt: o.minutes ? new Date() : null,
        preparationMinutes: o.minutes ?? null,
        estimatedReadyAt: null,
        readyAt: o.ready ? new Date() : null,
        pickedUpAt: null,
        customerName: 'Ana',
        customerNotes: null,
        lines: [{ name: 'Empanada', quantity: 4, notes: null, prepMinutes: 12 }],
        itemsTotal: '8000.00',
        courier: null,
        cancellation: null,
      }));
  }
  async declineReasons() {
    return ['MERCHANT_OUT_OF_STOCK', 'MERCHANT_TOO_BUSY'];
  }
  private mine(actor: MerchantActor, code: string) {
    const order = this.orders.get(code);
    return order && this.served.has(`${actor.userId}:${order.establishmentId}`) ? order : null;
  }
  async accept(actor: MerchantActor, code: string, minutes: number): Promise<MerchantResult> {
    const order = this.mine(actor, code);
    if (!order) return { ok: false, reason: 'NOT_FOUND' };
    if (order.status !== 'AWAITING_MERCHANT') return { ok: false, reason: 'STEP', status: order.status };
    Object.assign(order, { status: 'PENDING_ASSIGNMENT', minutes });
    return { ok: true, status: order.status };
  }
  async decline(actor: MerchantActor, code: string, reason: string): Promise<MerchantResult> {
    const order = this.mine(actor, code);
    if (!order) return { ok: false, reason: 'NOT_FOUND' };
    if (!(await this.declineReasons()).includes(reason)) return { ok: false, reason: 'REASON' };
    order.status = 'CANCELLED';
    return { ok: true, status: order.status };
  }
  async markReady(actor: MerchantActor, code: string): Promise<MerchantResult> {
    const order = this.mine(actor, code);
    if (!order) return { ok: false, reason: 'NOT_FOUND' };
    if (!order.minutes) return { ok: false, reason: 'STEP', status: order.status };
    order.ready = true;
    return { ok: true, status: order.status };
  }
  async setOpen(actor: MerchantActor, establishmentId: string, open: boolean): Promise<MerchantResult> {
    if (!this.served.has(`${actor.userId}:${establishmentId}`)) return { ok: false, reason: 'NOT_FOUND' };
    return open ? { ok: false, reason: 'MENU' } : { ok: true, status: 'TEMPORARILY_CLOSED' };
  }
}
