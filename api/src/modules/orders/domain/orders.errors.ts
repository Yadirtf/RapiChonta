import { ConflictError, DomainError, NotFoundError, PermissionDeniedError, ServiceUnavailableError } from '../../../shared/domain/domain.error';

/** Errores del módulo de pedidos. El `code` es el contrato con la web y la app (lo traducen). */
export const OrderErrors = {
  emptyOrder: () => new DomainError('El pedido no tiene productos', 'EMPTY_ORDER'),
  tooManyLines: (max: number) => new DomainError(`Máximo ${max} productos distintos por pedido`, 'TOO_MANY_LINES', { max }),
  invalidQuantity: (max: number) => new DomainError(`La cantidad va de 1 a ${max}`, 'INVALID_QUANTITY', { max }),
  duplicateProduct: () => new DomainError('El mismo producto aparece dos veces', 'DUPLICATE_PRODUCT'),
  /** `productIds`: los que ya no se pueden pedir (agotados, retirados o de otro local): la canasta los quita. */
  productsUnavailable: (productIds: string[]) => new DomainError('Hay productos que ya no se pueden pedir', 'PRODUCTS_UNAVAILABLE', { productIds }),
  /** `changes`: versión y precio vigentes; el cliente debe ver el precio nuevo antes de confirmar. */
  productsChanged: (changes: { productId: string; versionId: string; price: string }[]) =>
    new DomainError('Cambió el precio o la descripción de algunos productos', 'PRODUCTS_CHANGED', { changes }),
  establishmentNotFound: () => new NotFoundError('ESTABLISHMENT_NOT_FOUND', 'Establecimiento no encontrado'),
  establishmentNotAccepting: () => new DomainError('El establecimiento no está recibiendo pedidos', 'ESTABLISHMENT_NOT_ACCEPTING_ORDERS'),
  /** Cliente sin pedidos entregados: `limit` es el tope y `available` lo que le queda (descontando sus pedidos activos). */
  newCustomerLimit: (limit: string, available: string) =>
    new DomainError('Tu primer pedido tiene un tope mientras recibes tu primera entrega', 'NEW_CUSTOMER_LIMIT', { limit, available }),
  paymentMethodUnavailable: () => new DomainError('Ese medio de pago no está disponible', 'PAYMENT_METHOD_UNAVAILABLE'),
  paymentMethodNotFound: () => new NotFoundError('PAYMENT_METHOD_NOT_FOUND', 'Medio de pago no encontrado'),
  /** El cliente siempre debe tener al menos un medio para pagar al recibir. */
  lastPaymentMethod: () => new DomainError('Debe quedar al menos un medio de pago visible para los clientes', 'LAST_PAYMENT_METHOD'),
  /** El nuevo orden debe traer cada medio una sola vez (alguien más pudo agregar o quitar uno). */
  paymentOrderMismatch: () => new ConflictError('PAYMENT_ORDER_MISMATCH', 'La lista de medios cambió; recarga e intenta de nuevo'),
  paymentImageNotUsable: () => new DomainError('La imagen no sirve para un medio de pago', 'FILE_NOT_USABLE'),
  /** Los medios de pago son de todos los municipios: solo los cambia el administrador general. */
  paymentMethodsGlobalOnly: () => new PermissionDeniedError('PAYMENT_METHODS_GLOBAL_ONLY', 'Solo el administrador general cambia los medios de pago'),
  /** Falta la comisión del municipio: el administrador debe configurarla antes de recibir pedidos. */
  ordersNotConfigured: () => new ServiceUnavailableError('ORDERS_NOT_CONFIGURED', 'El municipio aún no está listo para recibir pedidos'),
  referenceRequired: () => new DomainError('Escribe una referencia para encontrar el lugar', 'TEXT_REQUIRED', { field: 'reference' }),
  labelRequired: () => new DomainError('Ponle un nombre a la dirección (Casa, Trabajo)', 'TEXT_REQUIRED', { field: 'label' }),
  recipientNameRequired: () => new DomainError('Escribe el nombre de quien recibe', 'TEXT_REQUIRED', { field: 'recipientName' }),
  addressNotFound: () => new NotFoundError('ADDRESS_NOT_FOUND', 'Dirección no encontrada'),
  recipientNotFound: () => new NotFoundError('RECIPIENT_NOT_FOUND', 'Destinatario no encontrado'),
  tooManyAddresses: (max: number) => new DomainError(`Máximo ${max} direcciones guardadas`, 'TOO_MANY_ADDRESSES', { max }),
  orderNotFound: () => new NotFoundError('ORDER_NOT_FOUND', 'Pedido no encontrado'),
  /** El mismo clientRequestId ya creó un pedido de otro cliente (no debería pasar con UUID). */
  requestReused: () => new ConflictError('REQUEST_REUSED', 'Esta solicitud ya se usó'),
};
