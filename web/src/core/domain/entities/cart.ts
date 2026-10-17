import type { EstablishmentDetail } from "./establishment";
import { toCents } from "./money";

/**
 * Canasta del cliente: de un solo establecimiento, porque un domiciliario compra en un solo lugar.
 * Guarda una copia del precio para mostrarla, pero el pedido (E04) se confirma con la versión vigente.
 */
export interface CartLine {
  productId: string;
  versionId: string;
  name: string;
  price: string;
  imageUrl: string | null;
  quantity: number;
}

export interface Cart {
  establishmentId: string;
  establishmentName: string;
  lines: CartLine[];
}

export const CART_LIMITS = { quantity: 20, lines: 40 } as const;

export const cartCount = (cart: Cart | null) => cart?.lines.reduce((sum, l) => sum + l.quantity, 0) ?? 0;

export const cartSubtotalCents = (cart: Cart | null) => cart?.lines.reduce((sum, l) => sum + toCents(l.price) * l.quantity, 0) ?? 0;

export const quantityOf = (cart: Cart | null, productId: string) => cart?.lines.find((l) => l.productId === productId)?.quantity ?? 0;

/** true si agregar de este establecimiento obliga a vaciar la canasta de otro. */
export const belongsToOther = (cart: Cart | null, establishmentId: string) => !!cart && cart.lines.length > 0 && cart.establishmentId !== establishmentId;

export function addToCart(cart: Cart | null, establishment: { id: string; name: string }, line: Omit<CartLine, "quantity">): Cart {
  const base = cart && !belongsToOther(cart, establishment.id) ? cart : { establishmentId: establishment.id, establishmentName: establishment.name, lines: [] };
  const existing = base.lines.find((l) => l.productId === line.productId);
  if (existing) return setQuantity(base, line.productId, existing.quantity + 1) ?? base;
  if (base.lines.length >= CART_LIMITS.lines) return base;
  return { ...base, establishmentName: establishment.name, lines: [...base.lines, { ...line, quantity: 1 }] };
}

/** Cantidad nueva; 0 quita la línea. Devuelve null si la canasta queda vacía. */
export function setQuantity(cart: Cart, productId: string, quantity: number): Cart | null {
  const q = Math.max(0, Math.min(CART_LIMITS.quantity, Math.trunc(quantity)));
  const lines = cart.lines.flatMap((l) => (l.productId !== productId ? [l] : q > 0 ? [{ ...l, quantity: q }] : []));
  return lines.length ? { ...cart, lines } : null;
}

/**
 * Pone la canasta al día con el menú recién cargado: precio, nombre y versión vigentes; quita lo que ya
 * no se puede pedir. `removed` y `repriced` le permiten a la vista avisar qué cambió.
 */
export function reconcileCart(cart: Cart, menu: EstablishmentDetail): { cart: Cart | null; removed: string[]; repriced: string[] } {
  if (cart.establishmentId !== menu.id) return { cart, removed: [], repriced: [] };
  const products = new Map(menu.sections.flatMap((s) => s.products).map((p) => [p.id, p]));
  const removed: string[] = [];
  const repriced: string[] = [];
  const lines = cart.lines.flatMap((line) => {
    const current = products.get(line.productId);
    if (!current || !current.orderable || !menu.acceptsOrders) {
      removed.push(line.name);
      return [];
    }
    if (toCents(current.price) !== toCents(line.price)) repriced.push(current.name);
    return [{ ...line, versionId: current.versionId, name: current.name, price: current.price, imageUrl: current.imageUrl }];
  });
  return { cart: lines.length ? { ...cart, establishmentName: menu.name, lines } : null, removed, repriced };
}

/** Lectura defensiva de lo guardado en el navegador (puede venir de una versión vieja o editado a mano). */
export function parseStoredCart(raw: string | null): Cart | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Cart>;
    if (typeof value.establishmentId !== "string" || typeof value.establishmentName !== "string" || !Array.isArray(value.lines)) return null;
    const lines = value.lines
      .filter(
        (l): l is CartLine =>
          !!l &&
          typeof l.productId === "string" &&
          typeof l.versionId === "string" &&
          typeof l.name === "string" &&
          typeof l.price === "string" &&
          Number.isFinite(toCents(l.price)) &&
          Number.isInteger(l.quantity) &&
          l.quantity > 0,
      )
      .slice(0, CART_LIMITS.lines)
      .map((l) => ({ ...l, imageUrl: typeof l.imageUrl === "string" ? l.imageUrl : null, quantity: Math.min(l.quantity, CART_LIMITS.quantity) }));
    return lines.length ? { establishmentId: value.establishmentId, establishmentName: value.establishmentName, lines } : null;
  } catch {
    return null;
  }
}
