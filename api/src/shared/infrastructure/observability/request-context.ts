import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const storage = new AsyncLocalStorage<{ requestId: string }>();

/** Id de la petición en curso: une los logs de una misma petición y el evento de Sentry con la respuesta. */
export const currentRequestId = (): string | undefined => storage.getStore()?.requestId;

/** Se respeta el `X-Request-Id` que pone un proxy (si tiene forma de id); si no, se genera uno. */
const VALID_ID = /^[\w-]{8,64}$/;

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  storage.run({ requestId }, next);
}
