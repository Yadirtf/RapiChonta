import {
  AuthenticationError,
  ConflictError,
  DomainError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from '../../../shared/domain/domain.error';

/** Errores del módulo identity. El `code` es el contrato con la web y la app (lo traducen). */
export const IdentityErrors = {
  invalidPhone: () => new DomainError('Número de celular inválido', 'INVALID_PHONE'),
  otpSendLimit: (retryAfterSeconds: number) =>
    new RateLimitError('OTP_SEND_LIMIT', retryAfterSeconds, 'Se alcanzó el máximo de códigos por hora'),
  otpInvalid: (remainingAttempts: number) =>
    new AuthenticationError('OTP_INVALID', 'Código incorrecto', { remainingAttempts }),
  otpExpired: () => new AuthenticationError('OTP_EXPIRED', 'El código venció'),
  otpLocked: () => new RateLimitError('OTP_LOCKED', undefined, 'Demasiados intentos con este código'),
  otpNotFound: () => new AuthenticationError('OTP_NOT_FOUND', 'Solicitud de código no encontrada'),
  invalidCredentials: () => new AuthenticationError('INVALID_CREDENTIALS', 'Número o contraseña incorrectos'),
  passwordLocked: (retryAfterSeconds: number) =>
    new RateLimitError('PASSWORD_LOCKED', retryAfterSeconds, 'Demasiados intentos de contraseña'),
  weakPassword: () => new DomainError('La contraseña no cumple la política', 'WEAK_PASSWORD'),
  accountDisabled: () => new PermissionDeniedError('ACCOUNT_DISABLED', 'La cuenta está desactivada'),
  registrationExpired: () => new AuthenticationError('REGISTRATION_EXPIRED', 'El registro venció, pida otro código'),
  consentRequired: (missing: string[]) =>
    new DomainError('Debe aceptar los documentos legales vigentes', 'CONSENT_REQUIRED', { missing }),
  phoneAlreadyRegistered: () => new ConflictError('PHONE_ALREADY_REGISTERED', 'El número ya tiene una cuenta'),
  documentAlreadyRegistered: () => new ConflictError('DOCUMENT_ALREADY_REGISTERED', 'El documento ya está registrado'),
  alreadyHasRole: () => new ConflictError('ROLE_ALREADY_GRANTED', 'La persona ya tiene ese rol'),
  sessionInvalid: () => new AuthenticationError('SESSION_INVALID', 'La sesión no es válida'),
  refreshReused: () => new AuthenticationError('REFRESH_REUSED', 'La sesión se cerró por seguridad'),
  roleNotGranted: () => new PermissionDeniedError('ROLE_NOT_GRANTED', 'No tiene ese rol'),
  /** H08.7: con un pedido en curso no se pasa a modo cliente (lo terminaría sin compartir ubicación). */
  courierHasActiveOrder: () => new ConflictError('COURIER_HAS_ACTIVE_ORDER', 'Termina el pedido en curso antes de cambiar a modo cliente'),
  passwordRequired: () => new AuthenticationError('PASSWORD_REQUIRED', 'Ese modo exige su contraseña'),
  userNotFound: () => new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado'),
  courierNotFound: () => new NotFoundError('COURIER_NOT_FOUND', 'Domiciliario no encontrado'),
  invalidTransition: () => new ConflictError('INVALID_STATUS_TRANSITION', 'Ese cambio de estado no está permitido'),
  cannotChangeOwnStatus: () => new PermissionDeniedError('CANNOT_CHANGE_OWN_STATUS', 'No puede cambiar el estado de su propia cuenta'),
  municipalityOutOfScope: () => new PermissionDeniedError('MUNICIPALITY_OUT_OF_SCOPE', 'Solo puede asignar su propio municipio'),
  /** Su pedido en curso es del municipio actual: se cambia cuando lo termine. */
  courierBusyElsewhere: () => new ConflictError('COURIER_ON_ACTIVE_ORDER', 'El domiciliario tiene un pedido en curso'),
  municipalityRequired: () => new DomainError('El rol exige municipio', 'MUNICIPALITY_REQUIRED'),
  invalidOption: (field: string) => new DomainError(`Valor no válido para ${field}`, 'INVALID_OPTION', { field }),
  noPassword: () => new DomainError('La cuenta no usa contraseña', 'PASSWORD_NOT_SET'),
  samePhone: () => new DomainError('Es el mismo número actual', 'SAME_PHONE'),
};
