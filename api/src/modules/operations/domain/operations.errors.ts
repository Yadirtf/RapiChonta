import { ConflictError, DomainError, NotFoundError } from '../../../shared/domain/domain.error';

/** Errores del panel de pedidos. El `code` es el contrato con la web (lo traduce). */
export const OperationsErrors = {
  /** No existe o es de otro municipio (404, sin revelarlo). */
  orderNotFound: () => new NotFoundError('ORDER_NOT_FOUND', 'Pedido no encontrado'),
  incidentNotFound: () => new NotFoundError('INCIDENT_NOT_FOUND', 'Novedad no encontrada'),
  /** El pedido ya no está en un paso que el personal pueda cancelar (desde que se compra, solo una novedad lo cancela). */
  notCancellable: (status: string) => new DomainError('Ese pedido ya no se puede cancelar', 'ORDER_NOT_CANCELLABLE', { status }),
  cancellationReasonInvalid: () => new DomainError('Elige el motivo de la cancelación', 'CANCELLATION_REASON_INVALID'),
  /** Falta el comentario, o es muy corto. */
  noteRequired: () => new DomainError('Escribe un comentario de lo que pasó', 'NOTE_REQUIRED'),
  /** El pedido ya no espera revisión de la foto (el cliente confirmó, o se cerró solo). */
  proofNotPending: (status: string) => new DomainError('Esa entrega ya no está por revisar', 'PROOF_NOT_PENDING', { status }),
  incidentTypeInvalid: () => new DomainError('Ese tipo de novedad no aplica aquí', 'INCIDENT_TYPE_INVALID'),
  /** Ya la tomó otra persona, o ya se resolvió. */
  incidentClosed: (status: string) => new ConflictError('INCIDENT_CLOSED', `La novedad está ${status}`),
  /** La resolución no saca al pedido de la disputa (o la cambia sin abrirla). */
  resolutionInvalid: () => new DomainError('Esa resolución no aplica a esta novedad', 'INCIDENT_RESOLUTION_INVALID'),
};
