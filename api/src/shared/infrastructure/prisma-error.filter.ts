import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { Response } from 'express';
import { reportError } from './observability/sentry';

/**
 * Las reglas que garantiza la base de datos (índices únicos, CHECK, disparadores) llegan aquí cuando el caso
 * de uso no las anticipó (p. ej. dos peticiones a la vez). Se responden como errores de negocio, sin detalles.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class PrismaErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaErrorFilter.name);

  catch(error: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const [status, code] = this.classify(error);
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(error.message);
      reportError(error);
    }
    const field = code === 'ALREADY_EXISTS' ? duplicatedField(error) : undefined;
    response.status(status).json({ statusCode: status, code, message: code, ...(field ? { details: { field } } : {}) });
  }

  private classify(error: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError): [HttpStatus, string] {
    const known = error instanceof Prisma.PrismaClientKnownRequestError ? error : undefined;
    // Con el adaptador pg (Prisma 7) el SQLSTATE viaja en meta.driverAdapterError.cause.originalCode.
    const meta = known?.meta as { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
    const sqlState = String(meta?.driverAdapterError?.cause?.originalCode ?? meta?.code ?? '');
    const text = error.message;
    // 40001 (el disparador de estados) llega como P2034 "write conflict".
    if (text.includes('STATUS_CONFLICT') || sqlState === '40001' || known?.code === 'P2034') return [HttpStatus.CONFLICT, 'STATUS_CONFLICT'];
    if (known?.code === 'P2002' || sqlState === '23505' || text.includes('23505')) return [HttpStatus.CONFLICT, 'ALREADY_EXISTS'];
    if (known?.code === 'P2025') return [HttpStatus.NOT_FOUND, 'NOT_FOUND'];
    if (known?.code === 'P2003' || known?.code === 'P2004' || ['23514', '23P01', '23503'].includes(sqlState) || /2351[34]|23P01/.test(text)) {
      return [HttpStatus.UNPROCESSABLE_ENTITY, 'CONSTRAINT_VIOLATION'];
    }
    return [HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR'];
  }
}

/** Campos repetidos que el cliente sabe nombrar ("esa placa ya está registrada"); el resto queda genérico. */
const DUPLICATE_FIELDS: [RegExp, string][] = [
  [/plate/, 'plate'],
  [/document/, 'document'],
  [/phone/, 'phone'],
  [/account_number|accountNumber/, 'accountNumber'],
];

function duplicatedField(error: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError): string | undefined {
  const target = error instanceof Prisma.PrismaClientKnownRequestError ? (error.meta as { target?: unknown } | undefined)?.target : undefined;
  const text = `${Array.isArray(target) ? target.join(',') : String(target ?? '')} ${error.message}`;
  return DUPLICATE_FIELDS.find(([pattern]) => pattern.test(text))?.[1];
}
