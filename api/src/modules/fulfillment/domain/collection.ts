/**
 * H10.2 · Cobro contra entrega (Docs/14-base-de-datos/E11-cajas-y-comisiones.md#cobro-contra-entrega-h102-rf-61).
 * El domiciliario dice con qué medio le pagó el cliente y cuánto; si pagó con dos medios (parte en efectivo y parte
 * por Nequi) son dos pagos. Cada pago es un movimiento COLLECTION del libro de caja. Reglas puras, sin base de datos.
 */

/** Un pago tal como lo marca el domiciliario. */
export interface CollectedPayment {
  /** Código de payment_methods (CASH, NEQUI, ...). */
  paymentMethod: string;
  /** Pesos en texto decimal (RNF-05). */
  amount: string;
}

/** Lo que el catálogo y las cuentas del domiciliario dicen de cada medio, para validar sin adivinar por el código. */
export interface CollectionMethod {
  code: string;
  isAccountBased: boolean;
  /** Su cuenta vigente para ese medio; nula si no tiene (entonces no puede cobrar por ahí). */
  accountId: string | null;
}

/** Un pago listo para el libro: con la cuenta que recibió el dinero si el medio es de cuenta. */
export interface ResolvedPayment extends CollectedPayment {
  collectionAccountId: string | null;
}

/** Medios distintos en un mismo cobro: efectivo + uno de cuenta es lo normal; más de tres no tiene sentido en la puerta. */
export const MAX_COLLECTION_PAYMENTS = 3;

const AMOUNT = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export type CollectionProblem = 'EMPTY' | 'TOO_MANY' | 'AMOUNT' | 'REPEATED_METHOD' | 'METHOD' | 'NO_ACCOUNT';

/**
 * Valida el cobro y le pone a cada pago su cuenta. Devuelve el problema (lo traduce la app) o los pagos resueltos.
 * Que el total no coincida con lo que debía cobrar no es un error: pasa (vuelto mal dado, cliente que quedó debiendo)
 * y el panel lo muestra como alerta para que el operador lo revise con el domiciliario.
 */
export function resolveCollection(
  payments: readonly CollectedPayment[],
  methods: readonly CollectionMethod[],
): { ok: true; payments: ResolvedPayment[] } | { ok: false; problem: CollectionProblem } {
  if (payments.length === 0) return { ok: false, problem: 'EMPTY' };
  if (payments.length > MAX_COLLECTION_PAYMENTS) return { ok: false, problem: 'TOO_MANY' };
  const seen = new Set<string>();
  const resolved: ResolvedPayment[] = [];
  for (const payment of payments) {
    if (!AMOUNT.test(payment.amount) || Number(payment.amount) <= 0) return { ok: false, problem: 'AMOUNT' };
    if (seen.has(payment.paymentMethod)) return { ok: false, problem: 'REPEATED_METHOD' };
    seen.add(payment.paymentMethod);
    const method = methods.find((m) => m.code === payment.paymentMethod);
    if (!method) return { ok: false, problem: 'METHOD' };
    if (method.isAccountBased && !method.accountId) return { ok: false, problem: 'NO_ACCOUNT' };
    resolved.push({ ...payment, collectionAccountId: method.isAccountBased ? method.accountId : null });
  }
  return { ok: true, payments: resolved };
}

/** Suma en centavos (sin flotantes) de pagos en texto decimal. */
export function totalCents(payments: readonly { amount: string }[]): number {
  return payments.reduce((sum, p) => {
    const [whole, fraction = ''] = p.amount.split('.');
    return sum + Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  }, 0);
}

/** Centavos a texto decimal con dos cifras ("42000.00"), como los devuelve la base. */
export const formatCents = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
