/**
 * Ciclo de vida del pedido en el MVP (RapiChonta compra por el cliente).
 * El cliente ve estos estados, nunca la ubicación del domiciliario.
 * Ver Docs/05-flujos-y-ux.md para el diagrama.
 */
export enum OrderStatus {
  PENDING_ASSIGNMENT = 'PENDING_ASSIGNMENT', // creado, buscando domiciliario
  OFFERED = 'OFFERED',                       // notificado a uno o varios domiciliarios: el primero que acepte lo toma
  ACCEPTED = 'ACCEPTED',                     // aceptado: el domiciliario va hacia el establecimiento
  AT_ESTABLISHMENT = 'AT_ESTABLISHMENT',     // la app detectó que entró al área del local: está haciendo el pedido
  AWAITING_CUSTOMER = 'AWAITING_CUSTOMER',   // falta un producto o cambió el precio: el cliente debe decidir
  PREPARING = 'PREPARING',                   // pedido pagado en el local, en preparación
  ON_THE_WAY = 'ON_THE_WAY',                 // el domiciliario marcó "listo" y va hacia el cliente
  ARRIVING = 'ARRIVING',                     // el domiciliario está a pocos metros: el cliente debe confirmar
  PENDING_REVIEW = 'PENDING_REVIEW',         // el cliente no confirmó: el domiciliario subió foto de entrega y el operador revisa
  DELIVERED = 'DELIVERED',                   // el cliente confirmó "Recibí mi pedido" o el operador aprobó la foto
  DISPUTED = 'DISPUTED',                     // el cliente reportó que no lo recibió: decide RapiChonta
  CANCELLED = 'CANCELLED',
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_ASSIGNMENT]: [OrderStatus.OFFERED, OrderStatus.CANCELLED],
  [OrderStatus.OFFERED]: [OrderStatus.ACCEPTED, OrderStatus.PENDING_ASSIGNMENT, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.AT_ESTABLISHMENT, OrderStatus.CANCELLED],
  [OrderStatus.AT_ESTABLISHMENT]: [OrderStatus.PREPARING, OrderStatus.AWAITING_CUSTOMER, OrderStatus.CANCELLED],
  [OrderStatus.AWAITING_CUSTOMER]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.ON_THE_WAY],
  [OrderStatus.ON_THE_WAY]: [OrderStatus.ARRIVING, OrderStatus.DISPUTED],
  [OrderStatus.ARRIVING]: [OrderStatus.DELIVERED, OrderStatus.DISPUTED, OrderStatus.PENDING_REVIEW],
  [OrderStatus.PENDING_REVIEW]: [OrderStatus.DELIVERED, OrderStatus.DISPUTED],
  [OrderStatus.DISPUTED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => TRANSITIONS[from].includes(to);
