import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { reportError } from './sentry';

/**
 * Todo lo que no es un error de negocio ni de la base de datos conocido. Las HttpException 4xx (validación,
 * 404 de ruta) siguen su camino normal; lo demás se registra con su traza, se reporta a Sentry y responde 500.
 */
@Catch()
export class UnexpectedErrorFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('UnexpectedError');

  catch(error: unknown, host: ArgumentsHost): void {
    if (!(error instanceof HttpException) || error.getStatus() >= 500) {
      this.logger.error(error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined);
      reportError(error);
    }
    super.catch(error, host);
  }
}
