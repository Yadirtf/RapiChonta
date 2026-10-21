/**
 * Estados del pedido que el despacho nombra porque tiene comportamiento propio con ellos (Docs/14 README,
 * "¿Entonces el código nunca nombra un estado?"). Lo demás se decide con las marcas del catálogo
 * (is_initial, is_terminal, requires_courier).
 */
export const DISPATCH_ORDER_STATUSES = {
  /** Hay una oferta enviada esperando respuesta. */
  OFFERED: 'OFFERED',
  /** Un domiciliario la tomó. */
  ACCEPTED: 'ACCEPTED',
} as const;
