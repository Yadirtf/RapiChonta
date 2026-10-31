import { MerchantErrors } from './merchants.errors';
import { MERCHANT_ORDER_STATUSES, PREPARATION_MINUTES } from './merchants.codes';

/**
 * El tiempo que el comercio promete al aceptar (H15.1, "reporta el tiempo real de preparación"). Entero, en el rango
 * de PREPARATION_MINUTES: la base lo vuelve a exigir.
 */
export function assertPreparationMinutes(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < PREPARATION_MINUTES.min || minutes > PREPARATION_MINUTES.max) {
    throw MerchantErrors.preparationMinutesInvalid(PREPARATION_MINUTES.min, PREPARATION_MINUTES.max);
  }
  return minutes;
}

/** Lo que sugiere el portal al aceptar: lo que tarda el producto más lento del menú (lo mismo que vio el cliente). */
export function suggestedMinutes(lines: { prepMinutes: number }[]): number {
  const slowest = Math.max(0, ...lines.map((l) => l.prepMinutes));
  return Math.min(PREPARATION_MINUTES.max, Math.max(PREPARATION_MINUTES.min, slowest || 15));
}

/** Columnas del mostrador del comercio, en el orden en que avanza un pedido. */
export const COUNTER_LANES = ['INCOMING', 'PREPARING', 'READY', 'CLOSED'] as const;
export type CounterLane = (typeof COUNTER_LANES)[number];

export interface CounterOrderState {
  status: string;
  terminal: boolean;
  acceptedAt: Date | null;
  readyAt: Date | null;
  pickedUpAt: Date | null;
}

/**
 * En qué columna va un pedido: por aceptar, en preparación, listo para recoger (marcado listo y aún en el local) o
 * cerrado (salió del local, se entregó o se canceló). Sin base de datos, para probarlo solo.
 */
export function laneOf(order: CounterOrderState): CounterLane {
  if (order.status === MERCHANT_ORDER_STATUSES.AWAITING) return 'INCOMING';
  if (order.terminal || order.pickedUpAt) return 'CLOSED';
  if (order.readyAt) return 'READY';
  return 'PREPARING';
}

/** Lo más urgente primero: lo que espera respuesta por antigüedad, lo que se prepara por la hora prometida. */
export function sortCounter<T extends CounterOrderState & { createdAt: Date; estimatedReadyAt: Date | null; closedAt: Date | null }>(orders: T[]): T[] {
  const lane = (o: T) => COUNTER_LANES.indexOf(laneOf(o));
  const key = (o: T) => {
    switch (laneOf(o)) {
      case 'INCOMING':
        return o.createdAt.getTime();
      case 'PREPARING':
        return o.estimatedReadyAt?.getTime() ?? o.createdAt.getTime();
      case 'READY':
        return o.readyAt!.getTime();
      default:
        return -(o.closedAt?.getTime() ?? o.createdAt.getTime());
    }
  };
  return [...orders].sort((a, b) => lane(a) - lane(b) || key(a) - key(b));
}
