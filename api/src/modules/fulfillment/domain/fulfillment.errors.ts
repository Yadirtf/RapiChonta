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
  /** El código de entrega no coincide. `attemptsLeft`: cuántos más puede probar antes del bloqueo. */
  deliveryCodeWrong: (attemptsLeft: number) => new DomainError('Ese no es el código del pedido', 'DELIVERY_CODE_WRONG', { attemptsLeft }),
  /** Se acabaron los intentos: entrega con foto. */
  deliveryCodeLocked: () => new DomainError('Se acabaron los intentos del código: entrega con foto', 'DELIVERY_CODE_LOCKED'),
  /** La foto se habilita después de un rato en el punto (delivery.proof_after_seconds). */
  proofTooEarly: (availableAt: Date) => new DomainError('Aún no puedes entregar con foto', 'DELIVERY_PROOF_TOO_EARLY', { availableAt: availableAt.toISOString() }),
  /** La foto no es una foto de entrega que este domiciliario haya subido, o ya se usó. */
  proofInvalid: () => new DomainError('Toma la foto de la entrega otra vez', 'DELIVERY_PROOF_INVALID'),
  /** El cliente no tiene ese pedido (404, sin revelar nada). */
  orderNotFound: () => new NotFoundError('ORDER_NOT_FOUND', 'Pedido no encontrado'),
  /** El pedido no está en un paso donde el cliente pueda confirmar o reclamar. */
  deliveryStepNotAllowed: (status: string) => new DomainError('Tu pedido no está en ese paso', 'DELIVERY_STEP_NOT_ALLOWED', { status }),
  /** E09: lo que mandó el domiciliario no es una consulta válida (`problem`: ver reportProblem). */
  adjustmentReportInvalid: (problem: string) => new DomainError('Revisa los productos que marcaste', 'ADJUSTMENT_REPORT_INVALID', { problem }),
  /** E09: alguna línea marcada ya no está en el pedido (se quitó en otra consulta). */
  adjustmentLinesInvalid: () => new DomainError('Alguno de esos productos ya no está en el pedido', 'ADJUSTMENT_LINES_INVALID'),
  /** E09: esa línea ya tiene decisión (la tomó otra pestaña o venció el tiempo), o el pedido ya no espera al cliente. */
  adjustmentClosed: (status: string) => new DomainError('Esa pregunta ya se respondió', 'ADJUSTMENT_CLOSED', { status }),
  /** E09: esa decisión no es una de las opciones de la línea (p. ej. aceptar precio si no cambió el precio). */
  adjustmentOptionInvalid: () => new DomainError('Esa opción no aplica a este producto', 'ADJUSTMENT_OPTION_INVALID'),
  /** E09: el producto elegido para cambiar ya no se puede pedir, o ya está en el pedido. */
  substituteUnavailable: () => new DomainError('Ese producto ya no se puede pedir: elige otro', 'SUBSTITUTE_UNAVAILABLE'),
  /** El mismo evento de la cola sin señal ya se aplicó a otro pedido (no debería pasar: id generado en el teléfono). */
  eventConflict: () => new ConflictError('CLIENT_EVENT_CONFLICT', 'Ese cambio ya se registró en otro pedido'),
};
