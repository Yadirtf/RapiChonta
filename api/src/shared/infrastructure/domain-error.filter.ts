import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  AuthenticationError,
  ConflictError,
  DomainError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServiceUnavailableError,
} from '../domain/domain.error';

const STATUS_BY_ERROR: [new (...args: never[]) => DomainError, HttpStatus][] = [
  [NotFoundError, HttpStatus.NOT_FOUND],
  [AuthenticationError, HttpStatus.UNAUTHORIZED],
  [PermissionDeniedError, HttpStatus.FORBIDDEN],
  [ConflictError, HttpStatus.CONFLICT],
  [RateLimitError, HttpStatus.TOO_MANY_REQUESTS],
  [ServiceUnavailableError, HttpStatus.SERVICE_UNAVAILABLE],
];

/** Traduce los errores del dominio a HTTP. El cliente recibe un `code` estable que traduce a su idioma. */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_ERROR.find(([type]) => error instanceof type)?.[1] ?? HttpStatus.UNPROCESSABLE_ENTITY;
    if (error instanceof RateLimitError && error.retryAfterSeconds) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    response.status(status).json({
      statusCode: status,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }
}
