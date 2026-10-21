import { ConflictError, DomainError, NotFoundError } from '../../../shared/domain/domain.error';

/** Errores del pedido en curso del domiciliario. El `code` es el contrato con la app (lo traduce). */
export const FulfillmentErrors = {
  /** No tiene ese pedido en curso (o no es suyo): 404 para no revelar pedidos ajenos. */
  tripNotFound: () => new NotFoundError('TRIP_NOT_FOUND', 'No tienes ese pedido en curso'),
  /** El pedido ya no está en el paso que la acción espera (otro cambio llegó antes, o la acción no aplica). */
  stepNotAllowed: (status: string) => new DomainError('Ese paso no corresponde al estado del pedido', 'TRIP_STEP_NOT_ALLOWED', { status }),
  /** El total pagado debe ser un monto positivo con hasta dos decimales. */
  purchaseAmountInvalid: () => new DomainError('Escribe el total que pagaste en el local', 'PURCHASE_AMOUNT_INVALID'),
  /** La foto no es una factura que este domiciliario haya subido, o ya se usó en otra compra. */
  receiptInvalid: () => new DomainError('Toma la foto de la factura otra vez', 'RECEIPT_INVALID'),
  /** El mismo evento de la cola sin señal ya se aplicó a otro pedido (no debería pasar: id generado en el teléfono). */
  eventConflict: () => new ConflictError('CLIENT_EVENT_CONFLICT', 'Ese cambio ya se registró en otro pedido'),
};
