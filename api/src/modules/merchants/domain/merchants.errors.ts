import { ConflictError, DomainError, NotFoundError } from '../../../shared/domain/domain.error';

/** Errores del portal del comercio y de los convenios. El `code` es el contrato con la web (lo traduce). */
export const MerchantErrors = {
  /** No atiende ese local (o el convenio terminó): 404 para no revelar locales ajenos. */
  storeNotFound: () => new NotFoundError('STORE_NOT_FOUND', 'No atiendes ese local'),
  orderNotFound: () => new NotFoundError('STORE_ORDER_NOT_FOUND', 'Ese pedido no es de tu local'),
  /** Otro cambio llegó antes (el cliente o el operador lo cancelaron, o ya se aceptó). */
  orderStepNotAllowed: (status: string) => new DomainError('Ese paso no corresponde al estado del pedido', 'STORE_ORDER_STEP_NOT_ALLOWED', { status }),
  preparationMinutesInvalid: (min: number, max: number) =>
    new DomainError(`El tiempo de preparación va de ${min} a ${max} minutos`, 'PREPARATION_MINUTES_INVALID', { min, max }),
  declineReasonInvalid: () => new DomainError('Elige por qué no puedes atender el pedido', 'DECLINE_REASON_INVALID'),
  /** Abrir el local exige al menos un producto disponible (igual que publicarlo desde el panel). */
  menuEmpty: () => new DomainError('Activa al menos un producto antes de abrir', 'MENU_EMPTY'),
  /** Solo se pausa un local abierto y se abre uno pausado: publicar o dar de baja es del panel. */
  storeStatusNotAllowed: (status: string) => new DomainError('Ese cambio del local se hace desde RapiChonta', 'STORE_STATUS_NOT_ALLOWED', { status }),
  establishmentNotFound: () => new NotFoundError('ESTABLISHMENT_NOT_FOUND', 'Establecimiento no encontrado'),
  partnershipActive: () => new ConflictError('PARTNERSHIP_ACTIVE', 'El local ya tiene un convenio vigente'),
  partnershipNotFound: () => new NotFoundError('PARTNERSHIP_NOT_FOUND', 'El local no tiene un convenio vigente'),
  partnershipDatesInvalid: () => new DomainError('Revisa las fechas del convenio', 'PARTNERSHIP_DATES_INVALID'),
  /** El convenio arranca en el futuro y no se puede dar acceso hasta entonces, o ya terminó. */
  partnershipRequired: () => new DomainError('El local necesita un convenio vigente para tener portal', 'PARTNERSHIP_REQUIRED'),
  agreementNotUsable: () => new DomainError('La foto del convenio no sirve', 'FILE_NOT_USABLE'),
  /** La persona ya atiende ese local. */
  staffExists: () => new ConflictError('STORE_STAFF_EXISTS', 'Esa persona ya atiende este local'),
  /** El número no es de nadie del comercio: hay que crear su cuenta con nombre, documento y contraseña. */
  personRequired: () => new DomainError('Ese número no tiene cuenta de comercio: completa sus datos', 'MERCHANT_PERSON_REQUIRED'),
  staffNotFound: () => new NotFoundError('STORE_STAFF_NOT_FOUND', 'Esa persona no atiende este local'),
};
