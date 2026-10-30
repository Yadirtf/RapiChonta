/**
 * Estados del pedido que el despacho nombra porque tiene comportamiento propio con ellos (Docs/14 README,
 * "¿Entonces el código nunca nombra un estado?"). Lo demás se decide con las marcas del catálogo
 * (is_terminal, requires_courier).
 */
export const DISPATCH_ORDER_STATUSES = {
  /**
   * Espera domiciliario en el panel. Ya no es "el" estado inicial: el pedido directo (E15) nace esperando al
   * comercio y llega aquí cuando el comercio lo acepta. Una oferta vencida o rechazada vuelve aquí.
   */
  WAITING: 'PENDING_ASSIGNMENT',
  /** Hay una oferta enviada esperando respuesta. */
  OFFERED: 'OFFERED',
  /** Un domiciliario la tomó. */
  ACCEPTED: 'ACCEPTED',
} as const;
