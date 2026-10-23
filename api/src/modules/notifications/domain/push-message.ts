import { PushProviderCode } from './notifications.codes';

/**
 * Mensaje listo para un proveedor, ya en el idioma de quien lo recibe. `data` viaja con el aviso para que,
 * al tocarlo, la app abra lo que corresponde (por ejemplo, el pedido) sin depender del texto.
 */
export interface PushMessage {
  title: string;
  body: string;
  data: { type: string; notificationId: string; orderCode?: string; status?: string; audience?: string };
  highPriority: boolean;
  /** Avisos con la misma etiqueta se reemplazan en la bandeja del teléfono (un aviso vivo por pedido). */
  tag?: string;
}

/** Resultado por token. `invalidToken`: el proveedor dice que ya no existe y se da de baja. */
export type PushOutcome =
  | { kind: 'sent'; providerMessageId?: string }
  | { kind: 'invalidToken'; errorCode: string }
  | { kind: 'failed'; errorCode: string; retryable: boolean };

export interface PushTarget {
  tokenId: string;
  token: string;
  provider: PushProviderCode;
}
