/**
 * Módulo `cash` (Docs/14-base-de-datos/E11-cajas-y-comisiones.md): la caja diaria de cada domiciliario. Un solo libro
 * (cash_movements); el saldo, las tarifas y las comisiones de cada caja salen de v_cash_box_balances.
 */
export const CASH_PERMISSIONS = {
  /** Abrir, ver y cerrar las cajas del municipio. */
  MANAGE: 'cash.manage',
  /** Ajustes firmados (correcciones del libro). */
  ADJUST: 'cash.adjust',
  /** El domiciliario ve la suya. */
  READ_OWN: 'cash.read_own',
} as const;

/** Tipos de movimiento que escribe este módulo; los de pedido (PURCHASE, COLLECTION) los escribe fulfillment. */
export const CASH_MOVEMENTS = {
  OPENING: 'OPENING',
  RETURN: 'RETURN',
  ADJUSTMENT_IN: 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT: 'ADJUSTMENT_OUT',
} as const;

/** Sentido de un ajuste desde lo que el domiciliario debe: IN lo aumenta (a favor de RapiChonta), OUT lo baja. */
export const ADJUSTMENT_DIRECTIONS = { IN: 'IN', OUT: 'OUT' } as const;
export type AdjustmentDirection = keyof typeof ADJUSTMENT_DIRECTIONS;

/** Una caja: sin fila en cash_box_closures está abierta. */
export type CashBoxState = 'OPEN' | 'CLOSED';

/** Medios distintos con que el domiciliario entrega al cierre (efectivo + uno o dos de cuenta). */
export const MAX_RETURN_PAYMENTS = 3;

export const MIN_NOTE_LENGTH = 4;
export const MAX_NOTE_LENGTH = 300;

export const REQUIRED_CASH_CODES: Record<string, readonly string[]> = {
  cash_movement_types: Object.values(CASH_MOVEMENTS),
};
