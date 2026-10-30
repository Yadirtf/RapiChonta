import { CashErrors } from './cash.errors';
import { MAX_NOTE_LENGTH, MAX_RETURN_PAYMENTS, MIN_NOTE_LENGTH } from './cash.codes';
import { Pesos } from './pesos';

/**
 * Las cuentas de la caja (RF-72), sin base de datos. La base calcula lo debido en v_cash_box_balances (la usa también
 * el disparador del cierre); aquí se arma el desglose que ve la gente y lo que queda tras lo que entrega al cierre.
 *
 * Con base B, compra P, cobro P + F (productos + tarifa F), comisión C y devolución R:
 * debe entregar = B − P + (P + F) − R − F + C = B + C − R (CASH_BOX) o C − R (OWN_FUNDS, sin B).
 */

/** Lo que suma cada tipo de movimiento en la caja, tal como sale de la base. */
export interface MovementTotal {
  type: string;
  direction: 1 | -1;
  /** Suma de los montos (siempre positivos) en texto decimal. */
  total: string;
  count: number;
}

export interface BoxBalance {
  movementsNet: string;
  courierFees: string;
  commissions: string;
  amountDue: string;
}

/** El saldo de la caja desde sus partes: el libro con signo, menos las tarifas del domiciliario, más las comisiones. */
export function amountDue(totals: readonly MovementTotal[], courierFees: string, commissions: string): BoxBalance {
  const net = Pesos.sum(totals.map((t) => Pesos.of(t.total).times(t.direction)));
  const due = net.minus(Pesos.of(courierFees)).plus(Pesos.of(commissions));
  return { movementsNet: net.toString(), courierFees: Pesos.of(courierFees).toString(), commissions: Pesos.of(commissions).toString(), amountDue: due.toString() };
}

/** Lo que el domiciliario entrega al cierre, por medio. */
export interface ReceivedPayment {
  paymentMethod: string;
  amount: string;
}

/** Los medios válidos para entregar o recibir dinero de la caja (los del catálogo de cobro contra entrega). */
export interface CashMethod {
  code: string;
  isAccountBased: boolean;
}

/**
 * Valida lo recibido al cierre: medios del catálogo, sin repetir, montos positivos. Una lista vacía es válida: el
 * domiciliario no entregó nada (p. ej. OWN_FUNDS sin pedidos) y el cierre muestra lo que falta.
 */
export function parseReceived(received: readonly ReceivedPayment[], methods: readonly CashMethod[]): { paymentMethod: string; amount: Pesos }[] {
  if (received.length > MAX_RETURN_PAYMENTS) throw CashErrors.tooManyMethods();
  const seen = new Set<string>();
  return received.map((r) => {
    const amount = positive(r.amount);
    if (!methods.some((m) => m.code === r.paymentMethod)) throw CashErrors.paymentMethodInvalid();
    if (seen.has(r.paymentMethod)) throw CashErrors.repeatedMethod();
    seen.add(r.paymentMethod);
    return { paymentMethod: r.paymentMethod, amount };
  });
}

/**
 * La diferencia al cerrar: lo debido menos lo recibido. Positiva = faltante (el domiciliario aún debe), negativa =
 * sobrante (entregó de más), cero = la caja cuadra.
 */
export function closingDifference(due: string, received: readonly { amount: Pesos }[]): Pesos {
  return Pesos.of(due).minus(Pesos.sum(received.map((r) => r.amount)));
}

/** Un monto que escribe el personal: positivo, con hasta dos decimales. */
export function positive(text: string): Pesos {
  const amount = Pesos.parse(text);
  if (!amount || !amount.isPositive()) throw CashErrors.amountInvalid();
  return amount;
}

/** La nota sin espacios de más; null si no dice nada útil. */
export function cleanNote(note: string | undefined | null): string | null {
  const text = (note ?? '').replace(/\s+/g, ' ').trim();
  return text.length >= MIN_NOTE_LENGTH ? text.slice(0, MAX_NOTE_LENGTH) : null;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-30" válido en el calendario; null si no. */
export function parseBusinessDate(text: string | undefined): string | null {
  const match = text ? DATE.exec(text) : null;
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === text ? text : null;
}
