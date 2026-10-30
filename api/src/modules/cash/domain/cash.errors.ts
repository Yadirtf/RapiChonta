import { MAX_RETURN_PAYMENTS } from './cash.codes';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/domain/domain.error';

/** Errores de las cajas. El `code` es el contrato con la web y la app (lo traducen). */
export const CashErrors = {
  /** No existe o es de otro municipio (404, sin revelarlo). */
  boxNotFound: () => new NotFoundError('CASH_BOX_NOT_FOUND', 'Caja no encontrada'),
  courierNotFound: () => new NotFoundError('COURIER_NOT_FOUND', 'Domiciliario no encontrado'),
  movementNotFound: () => new NotFoundError('CASH_MOVEMENT_NOT_FOUND', 'Movimiento no encontrado'),
  /** El domiciliario trabaja con su propio dinero (OWN_FUNDS): no lleva base. */
  noBaseForMode: (fundingMode: string | null) => new DomainError('Este domiciliario no trabaja con base', 'CASH_BOX_NO_BASE_MODE', { fundingMode }),
  alreadyOpened: () => new ConflictError('CASH_BOX_ALREADY_OPENED', 'La caja de hoy ya tiene su base'),
  /** La caja ya se cerró: solo admite ajustes. */
  closed: () => new ConflictError('CASH_BOX_CLOSED', 'La caja ya está cerrada'),
  /** Un pedido en curso: hay dinero en camino, se cierra cuando lo termine. */
  courierBusy: () => new ConflictError('CASH_BOX_COURIER_BUSY', 'El domiciliario tiene un pedido en curso'),
  amountInvalid: () => new DomainError('Escribe un valor en pesos mayor que cero', 'CASH_AMOUNT_INVALID'),
  paymentMethodInvalid: () => new DomainError('Ese medio no se usa en la caja', 'CASH_PAYMENT_METHOD_INVALID'),
  tooManyMethods: () => new DomainError(`Máximo ${MAX_RETURN_PAYMENTS} medios`, 'CASH_TOO_MANY_METHODS'),
  repeatedMethod: () => new DomainError('Cada medio va una sola vez', 'CASH_PAYMENT_METHOD_REPEATED'),
  /** Base por un medio de cuenta: el domiciliario no tiene registrada la cuenta donde se le envió. */
  accountRequired: (paymentMethod: string) => new DomainError('El domiciliario no tiene cuenta para ese medio', 'CASH_ACCOUNT_REQUIRED', { paymentMethod }),
  noteRequired: () => new DomainError('Escribe la nota de lo que pasó', 'NOTE_REQUIRED'),
  /** Ya se anuló, o no es del mismo domiciliario. */
  reversalInvalid: () => new ConflictError('CASH_REVERSAL_INVALID', 'Ese movimiento no se puede anular'),
  dateInvalid: () => new DomainError('Fecha inválida', 'CASH_DATE_INVALID'),
};
