import { PUSH_PROVIDERS } from '../../domain/notifications.codes';
import { PushGateway } from '../../domain/ports/push-gateway';
import { PushMessage, PushOutcome } from '../../domain/push-message';
import { BRAND_COLOR, NOTIFICATION_ICON } from './push-branding';
import { GoogleAccessToken, ServiceAccount } from './google-access-token';

/** Cuántos envíos a la vez (FCM v1 manda un token por petición). */
const CONCURRENCY = 10;

interface FcmError {
  error?: { code?: number; status?: string; message?: string; details?: { '@type'?: string; errorCode?: string }[] };
}

/**
 * Firebase Cloud Messaging, API HTTP v1 (Android con Google e iOS vía APNs), con fetch y sin el SDK de Firebase.
 * Clasifica las respuestas: token que ya no existe → baja; cuota o caída del servicio → reintento.
 * https://firebase.google.com/docs/cloud-messaging/send/v1-api
 */
export class FcmPushGateway extends PushGateway {
  readonly provider = PUSH_PROVIDERS.FCM;
  private readonly accessToken: GoogleAccessToken;

  constructor(
    private readonly account: ServiceAccount,
    private readonly http: typeof fetch = fetch,
  ) {
    super();
    this.accessToken = new GoogleAccessToken(account, http);
  }

  async send(message: PushMessage, tokens: string[]): Promise<PushOutcome[]> {
    const outcomes: PushOutcome[] = new Array(tokens.length);
    let next = 0;
    const worker = async () => {
      while (next < tokens.length) {
        const index = next++;
        outcomes[index] = await this.sendOne(message, tokens[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tokens.length) }, worker));
    return outcomes;
  }

  /** Cuerpo del mensaje (público para las pruebas). */
  payload(message: PushMessage, token: string) {
    return {
      message: {
        token,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: {
          priority: message.highPriority ? 'high' : 'normal',
          ...(message.tag ? { collapse_key: message.tag } : {}),
          notification: {
            icon: NOTIFICATION_ICON,
            color: BRAND_COLOR,
            ...(message.tag ? { tag: message.tag } : {}),
            default_sound: true,
          },
        },
        apns: {
          headers: { 'apns-priority': message.highPriority ? '10' : '5', ...(message.tag ? { 'apns-collapse-id': message.tag } : {}) },
          payload: { aps: { sound: 'default', ...(message.tag ? { 'thread-id': message.tag } : {}) } },
        },
      },
    };
  }

  private async sendOne(message: PushMessage, token: string, retriedAuth = false): Promise<PushOutcome> {
    const response = await this.http(`https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken.get()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(this.payload(message, token)),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const body = (await response.json()) as { name?: string };
      return { kind: 'sent', providerMessageId: body.name };
    }
    if (response.status === 401 && !retriedAuth) {
      this.accessToken.reset();
      return this.sendOne(message, token, true);
    }
    const body = ((await response.json().catch(() => ({}))) ?? {}) as FcmError;
    const errorCode = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status ?? `HTTP_${response.status}`;
    // UNREGISTERED: la app se desinstaló o el token rotó. SENDER_ID_MISMATCH: el token es de otro proyecto.
    // INVALID_ARGUMENT por el token: el valor no es un token de FCM.
    if (errorCode === 'UNREGISTERED' || errorCode === 'SENDER_ID_MISMATCH' || (errorCode === 'INVALID_ARGUMENT' && /token/i.test(body.error?.message ?? ''))) {
      return { kind: 'invalidToken', errorCode };
    }
    const retryable = response.status === 429 || response.status >= 500 || errorCode === 'UNAVAILABLE' || errorCode === 'INTERNAL' || errorCode === 'QUOTA_EXCEEDED';
    return { kind: 'failed', errorCode, retryable };
  }
}
