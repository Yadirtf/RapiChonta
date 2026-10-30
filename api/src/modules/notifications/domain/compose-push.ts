import { NOTIFICATION_TYPES } from './notifications.codes';
import { PendingNotification } from './ports/notification-outbox';
import { PushMessage } from './push-message';

interface Template {
  title: string;
  body: string;
}

/** Plantillas por idioma (api/src/i18n/<idioma>.json → push). Agregar un idioma es agregar un archivo. */
export type PushTexts = Record<string, { push: Record<string, Template | Record<string, Template>> }>;

const FALLBACK_LANGUAGE = 'es';

const fill = (text: string, values: Record<string, string | number | null | undefined>) =>
  text.replace(/\{(\w+)\}/g, (match, key: string) => (values[key] === undefined || values[key] === null ? match : String(values[key])));

const isTemplate = (value: unknown): value is Template =>
  typeof value === 'object' && value !== null && typeof (value as Template).title === 'string';

/**
 * Escribe el aviso en el idioma de quien lo recibe. El texto no se guarda en la base: sale del tipo, el estado,
 * el pedido y los parámetros. Sin plantilla para el tipo, devuelve null (el aviso queda solo en la bandeja).
 */
export function composePush(notification: PendingNotification, texts: PushTexts): PushMessage | null {
  const catalog = (texts[notification.language] ?? texts[FALLBACK_LANGUAGE]).push;
  const entry = catalog[notification.type];
  let template: Template | undefined;
  if (isTemplate(entry)) {
    template = entry;
  } else if (entry) {
    // Una plantilla por variante: el estado nuevo en ORDER_STATUS_CHANGED; en los demás, params.variant (p. ej. cómo
    // se resolvió una novedad). `_` es la de cualquier otro caso. Primero la del modo del pedido (`ESTADO@MODO`): en
    // un pedido directo el domiciliario recoge, no compra.
    const variant = String((notification.type === NOTIFICATION_TYPES.ORDER_STATUS_CHANGED ? notification.status : notification.params?.variant) ?? '');
    const byMode = notification.fulfillmentMode ? entry[`${variant}@${notification.fulfillmentMode}`] : undefined;
    template = byMode ?? entry[variant] ?? entry['_'];
  }
  if (!template) return null;

  const values = { ...notification.params, code: notification.orderCode, store: notification.storeName };
  return {
    title: fill(template.title, values),
    body: fill(template.body, values),
    data: {
      type: notification.type,
      notificationId: notification.id,
      ...(notification.orderCode ? { orderCode: notification.orderCode } : {}),
      ...(notification.status ? { status: notification.status } : {}),
      // Un mismo tipo puede llegar al cliente y al domiciliario (el cierre de un caso): la app abre la pantalla de cada uno.
      ...(typeof notification.params?.audience === 'string' ? { audience: notification.params.audience } : {}),
    },
    highPriority: notification.highPriority,
    tag: notification.orderCode ?? undefined,
  };
}
