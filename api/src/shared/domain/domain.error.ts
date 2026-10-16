/**
 * Error de regla de negocio. La capa de presentación lo traduce a un 4xx.
 * `code` es lo que reciben la web y la app (las traducen); `message` es solo para quien depura.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string = 'BUSINESS_RULE_VIOLATED',
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** El recurso no existe o no es de quien lo pide (se responde 404 para no revelar que existe). */
export class NotFoundError extends DomainError {
  constructor(code = 'NOT_FOUND', message = 'Recurso no encontrado') {
    super(message, code);
  }
}

/** Credenciales o sesión inválidas (401). */
export class AuthenticationError extends DomainError {
  constructor(code = 'UNAUTHENTICATED', message = 'Sesión inválida', details?: Record<string, unknown>) {
    super(message, code, details);
  }
}

/** Sesión válida pero sin permiso para la acción (403). */
export class PermissionDeniedError extends DomainError {
  constructor(code = 'FORBIDDEN', message = 'Sin permiso para esta acción') {
    super(message, code);
  }
}

/** Ya existe o cambió mientras se hacía la operación (409). */
export class ConflictError extends DomainError {
  constructor(code = 'CONFLICT', message = 'Conflicto con el estado actual') {
    super(message, code);
  }
}

/** Límite de intentos o de envíos alcanzado (429). */
export class RateLimitError extends DomainError {
  constructor(
    code = 'TOO_MANY_REQUESTS',
    readonly retryAfterSeconds?: number,
    message = 'Demasiados intentos',
  ) {
    super(message, code, retryAfterSeconds ? { retryAfterSeconds } : undefined);
  }
}

/** Un servicio externo (SMS, base de datos) no respondió (503). */
export class ServiceUnavailableError extends DomainError {
  constructor(code = 'SERVICE_UNAVAILABLE', message = 'Servicio no disponible') {
    super(message, code);
  }
}
