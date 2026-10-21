import type { BrowserOptions, ErrorEvent } from "@sentry/nextjs";

/*
 * Sentry en la web (H05.4). Solo se activa con NEXT_PUBLIC_SENTRY_DSN: sin él, el SDK ni siquiera se descarga
 * (se importa bajo demanda). Entorno (`pruebas`, `produccion`) y versión permiten saber dónde y desde cuándo falla.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Teléfonos, correos y series largas de dígitos (cédula, cuenta) que el cliente pudo escribir en un formulario. */
const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]"],
  [/(\+?57[\s-]?)?\b3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[número]"],
  [/\b\d{7,}\b/g, "[número]"],
];

export const scrubText = (text: string) => RULES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);

/** Sin `?lat=…&lng=…`: la ubicación del cliente también es un dato personal. */
const withoutQuery = (url: string) => url.split(/[?#]/)[0];

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = scrubText(event.message);
  for (const exception of event.exception?.values ?? []) if (exception.value) exception.value = scrubText(exception.value);
  if (event.request) event.request = { url: event.request.url && withoutQuery(event.request.url), method: event.request.method };
  delete event.user;
  delete event.extra;
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubText(crumb.message);
    if (typeof crumb.data?.url === "string") crumb.data.url = withoutQuery(crumb.data.url);
    if (typeof crumb.data?.to === "string") crumb.data.to = withoutQuery(crumb.data.to);
    if (typeof crumb.data?.from === "string") crumb.data.from = withoutQuery(crumb.data.from);
  }
  return event;
}

export function sentryOptions(dsn: string): BrowserOptions {
  return {
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || `rapichonta-web@${process.env.NEXT_PUBLIC_APP_VERSION}`,
    // Nada del cliente: ni usuario, cookies, cuerpos, consulta, encabezados ni variables locales.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubEvent,
  };
}

/** Reporta un error que cayó en una pantalla de error (si Sentry está activo). */
export function reportError(error: unknown) {
  if (!SENTRY_DSN) return;
  void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
}
