import { OrderErrors } from './orders.errors';
import { Money } from './value-objects/money';

/** Mismos límites que la canasta de la web y la app (Cart.maxLines / maxQuantity). */
export const CHECKOUT_LIMITS = { lines: 40, quantity: 20, notes: 200, customerNotes: 500 } as const;

export interface CartItem {
  /** La versión que el cliente vio en el menú: si ya no es la vigente, debe ver el cambio antes de confirmar. */
  productVersionId: string;
  quantity: number;
  notes?: string | null;
}

/** Lo que la base sabe de la versión que envió el cliente y de su producto hoy. */
export interface MenuVersion {
  versionId: string;
  productId: string;
  establishmentId: string;
  orderable: boolean;
  current: { versionId: string; name: string; price: string; prepMinutes: number };
}

export interface CheckoutLine {
  productVersionId: string;
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  notes: string | null;
  prepMinutes: number;
}

/** Exposición del cliente nuevo: sin entregas, lo que ya tiene en pedidos activos cuenta contra el tope. */
export interface CustomerExposure {
  deliveredOrders: number;
  activeItemsCents: number;
}

export interface NewCustomerLimit {
  limitCents: number;
  availableCents: number;
}

const cleanText = (value: string | null | undefined, max: number) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  return text || null;
};

/**
 * Lo que se va a cobrar (H04.1, H04.3), sin base de datos: valida la canasta contra el menú vigente y
 * calcula productos, domicilio, total y el tope de cliente nuevo. La cotización y la confirmación usan la
 * misma regla, así que el total que vio el cliente es el que queda en el pedido.
 */
export class Checkout {
  private constructor(
    readonly establishmentId: string,
    readonly lines: CheckoutLine[],
    readonly feeCents: number,
    readonly limit: NewCustomerLimit | null,
  ) {}

  static build(input: {
    establishmentId: string;
    items: CartItem[];
    menu: MenuVersion[];
    fee: string;
    exposure: CustomerExposure;
    /** Tope vigente del municipio; null si no hay tope configurado. */
    newCustomerLimit: string | null;
  }): Checkout {
    const { items } = input;
    if (!items.length) throw OrderErrors.emptyOrder();
    if (items.length > CHECKOUT_LIMITS.lines) throw OrderErrors.tooManyLines(CHECKOUT_LIMITS.lines);
    if (new Set(items.map((i) => i.productVersionId)).size !== items.length) throw OrderErrors.duplicateProduct();

    const menu = new Map(input.menu.map((m) => [m.versionId, m]));
    const unavailable: string[] = [];
    const changed: { productId: string; versionId: string; price: string }[] = [];
    const seenProducts = new Set<string>();
    const lines: CheckoutLine[] = [];

    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > CHECKOUT_LIMITS.quantity) {
        throw OrderErrors.invalidQuantity(CHECKOUT_LIMITS.quantity);
      }
      const version = menu.get(item.productVersionId);
      if (!version || version.establishmentId !== input.establishmentId || !version.orderable) {
        unavailable.push(version?.productId ?? item.productVersionId);
        continue;
      }
      // Dos versiones del mismo producto en una canasta: la vieja y la nueva. Es el mismo producto.
      if (seenProducts.has(version.productId)) throw OrderErrors.duplicateProduct();
      seenProducts.add(version.productId);
      if (version.current.versionId !== version.versionId) {
        changed.push({ productId: version.productId, versionId: version.current.versionId, price: version.current.price });
        continue;
      }
      lines.push({
        productVersionId: version.versionId,
        productId: version.productId,
        name: version.current.name,
        unitPriceCents: Money.toCents(version.current.price),
        quantity: item.quantity,
        notes: cleanText(item.notes, CHECKOUT_LIMITS.notes),
        prepMinutes: version.current.prepMinutes,
      });
    }
    // Primero lo que no se puede pedir (la canasta lo quita), después lo que cambió (el cliente lo revisa).
    if (unavailable.length) throw OrderErrors.productsUnavailable(unavailable);
    if (changed.length) throw OrderErrors.productsChanged(changed);

    let limit: NewCustomerLimit | null = null;
    if (input.newCustomerLimit !== null && input.exposure.deliveredOrders === 0) {
      const limitCents = Money.toCents(input.newCustomerLimit);
      limit = { limitCents, availableCents: Math.max(0, limitCents - input.exposure.activeItemsCents) };
    }
    return new Checkout(input.establishmentId, lines, Money.toCents(input.fee), limit);
  }

  get itemsCents(): number {
    return this.lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  }

  get totalCents(): number {
    return this.itemsCents + this.feeCents;
  }

  /** Tiempo estimado de preparación: el del producto que más tarda. */
  get prepMinutes(): number {
    return Math.max(...this.lines.map((l) => l.prepMinutes));
  }

  /** El tope cuenta los productos (lo que el domiciliario adelanta en el local), no el domicilio. */
  get exceedsNewCustomerLimit(): boolean {
    return this.limit !== null && this.itemsCents > this.limit.availableCents;
  }

  assertWithinNewCustomerLimit(): void {
    if (this.exceedsNewCustomerLimit) {
      throw OrderErrors.newCustomerLimit(Money.toDecimal(this.limit!.limitCents), Money.toDecimal(this.limit!.availableCents));
    }
  }
}
