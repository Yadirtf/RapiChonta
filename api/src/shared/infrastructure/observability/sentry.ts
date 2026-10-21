import * as Sentry from '@sentry/nestjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentRequestId } from './request-context';
import { scrubEvent } from './scrub';

/**
 * Sentry (H05.4). Solo se activa con SENTRY_DSN: en desarrollo y en las pruebas automáticas no envía nada.
 * El entorno (`pruebas`, `produccion`) y la versión (commit desplegado) permiten saber dónde y desde cuándo falla.
 */
export function initSentry(): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE || `rapichonta-api@${packageVersion()}`,
    // Nada del cliente: ni usuario, cookies, cuerpos, consulta (lleva la ubicación), datos de la base ni variables.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['user-agent'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubEvent,
  });
}

/** Versión de api/package.json (el contenedor arranca en api/). SENTRY_RELEASE la reemplaza, p. ej. con el commit. */
function packageVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Errores que la API no esperaba (5xx). Los errores de negocio (4xx) son respuestas normales y no se reportan. */
export function reportError(error: unknown): void {
  if (!Sentry.isInitialized()) return;
  Sentry.withScope((scope) => {
    const requestId = currentRequestId();
    if (requestId) scope.setTag('request_id', requestId);
    Sentry.captureException(error);
  });
}
