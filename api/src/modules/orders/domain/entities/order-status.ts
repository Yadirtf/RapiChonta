/**
 * Ciclo de vida del pedido en el MVP (RapiChonta compra por el cliente).
 * Ver Docs/05-flujos-y-ux.md para el diagrama de estados.
 */
export enum OrderStatus {
  PENDING_ASSIGNMENT = 'PENDING_ASSIGNMENT', // creado, esperando que un operador asigne domiciliario
  ASSIGNED = 'ASSIGNED',                     // domiciliario asignado manualmente
  PURCHASING = 'PURCHASING',                 // el domiciliario está comprando en el establecimiento
  PURCHASED = 'PURCHASED',                   // compra hecha, total real confirmado
  ON_THE_WAY = 'ON_THE_WAY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_ASSIGNMENT]: [OrderStatus.ASSIGNED, OrderStatus.CANCELLED],
  [OrderStatus.ASSIGNED]: [OrderStatus.PURCHASING, OrderStatus.PENDING_ASSIGNMENT, OrderStatus.CANCELLED],
  [OrderStatus.PURCHASING]: [OrderStatus.PURCHASED, OrderStatus.CANCELLED],
  [OrderStatus.PURCHASED]: [OrderStatus.ON_THE_WAY],
  [OrderStatus.ON_THE_WAY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => TRANSITIONS[from].includes(to);
