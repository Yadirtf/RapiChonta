import { ConflictError, DomainError, NotFoundError } from '../../../shared/domain/domain.error';

/** Errores del despacho. El `code` es el contrato con la web y la app (lo traducen). */
export const DispatchErrors = {
  orderNotFound: () => new NotFoundError('ORDER_NOT_FOUND', 'Pedido no encontrado'),
  /** El pedido ya tiene domiciliario, terminó o se canceló: no se puede ofrecer. */
  orderNotDispatchable: () => new ConflictError('ORDER_NOT_DISPATCHABLE', 'Este pedido ya no está buscando domiciliario'),
  /** SPECIFIC sin domiciliario, o un domiciliario que no está disponible ahora. */
  courierRequired: () => new DomainError('Elige a qué domiciliario enviarlo', 'COURIER_REQUIRED'),
  courierNotAvailable: () => new ConflictError('COURIER_NOT_AVAILABLE', 'Ese domiciliario ya no está disponible'),
  /** Ya tiene una oferta pendiente de este pedido. */
  offerAlreadyPending: () => new ConflictError('OFFER_ALREADY_PENDING', 'Ese domiciliario ya tiene este pedido en pantalla'),
  noCouriersAvailable: () => new ConflictError('NO_COURIERS_AVAILABLE', 'No hay domiciliarios disponibles en este momento'),

  offerNotFound: () => new NotFoundError('OFFER_NOT_FOUND', 'Oferta no encontrada'),
  /** Otro domiciliario aceptó primero ("Ya fue tomado"). */
  alreadyTaken: () => new ConflictError('ORDER_ALREADY_TAKEN', 'Otro domiciliario tomó el pedido'),
  offerExpired: () => new ConflictError('OFFER_EXPIRED', 'La oferta venció'),
  /** Ya la respondió, o el pedido se canceló mientras tanto. */
  offerClosed: () => new ConflictError('OFFER_CLOSED', 'Esta oferta ya no está abierta'),
  /** Lleva un pedido a la vez: termina el que tiene antes de tomar otro. */
  courierBusy: () => new ConflictError('COURIER_BUSY', 'Ya tienes un pedido en curso'),

  notVerified: () => new DomainError('Tu cuenta aún no está verificada para recibir pedidos', 'COURIER_NOT_VERIFIED'),
  /** Antes de activarse por primera vez acepta la autorización de ubicación (H08.1). */
  locationConsentRequired: () => new DomainError('Acepta la autorización de ubicación para recibir pedidos', 'LOCATION_CONSENT_REQUIRED'),
  /** Solo se reciben ubicaciones con Disponible activo o un pedido en curso (RNF-06). */
  locationNotExpected: () => new ConflictError('LOCATION_NOT_EXPECTED', 'Activa Disponible para compartir tu ubicación'),
};
