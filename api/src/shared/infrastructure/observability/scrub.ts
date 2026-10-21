import type { ErrorEvent } from '@sentry/nestjs';

/**
 * Nada personal sale del servidor (H05.4, RNF-10): teléfonos, correos y los valores que PostgreSQL copia en
 * sus mensajes ("Key (phone)=(3001234567)") se reemplazan antes de escribir un log o enviar un evento.
 * Las direcciones no tienen un formato reconocible, por eso los eventos nunca llevan cuerpo ni consulta.
 */
const RULES: [RegExp, string][] = [
  [/=\([^)]*\)/g, '=(…)'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]'],
  // Celular colombiano con o sin +57 y separadores, y cualquier serie de 7 o más dígitos (cédula, cuenta).
  [/(\+?57[\s-]?)?\b3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[número]'],
  [/\b\d{7,}\b/g, '[número]'],
];

export function scrubText(text: string): string {
  return RULES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

/** Sin `?lat=…&lng=…`: la ubicación del cliente también es un dato personal. */
export function withoutQuery(url: string): string {
  return url.split(/[?#]/)[0];
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = scrubText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url && withoutQuery(event.request.url),
      headers: event.request.headers?.['user-agent'] ? { 'user-agent': event.request.headers['user-agent'] } : undefined,
    };
  }
  delete event.user;
  delete event.extra;
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubText(crumb.message);
    if (typeof crumb.data?.url === 'string') crumb.data.url = withoutQuery(crumb.data.url);
  }
  return event;
}
