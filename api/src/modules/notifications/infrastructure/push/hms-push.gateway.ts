import { PUSH_PROVIDERS } from '../../domain/notifications.codes';
import { PushGateway } from '../../domain/ports/push-gateway';
import { PushMessage, PushOutcome } from '../../domain/push-message';
import { BRAND_COLOR, NOTIFICATION_ICON } from './push-branding';

export interface HmsOptions {
  /** App ID de AppGallery Connect. */
  appId: string;
  /** Client ID y secreto de la app (AppGallery Connect → Mi proyecto → General). El Client ID suele ser el App ID. */
  clientId: string;
  clientSecret: string;
  /** Actividad que abre el aviso al tocarlo, "paquete/.Actividad" (la de flutter create). */
  clickActivity: string;
  /**
   * Categoría de autoclasificación de Push Kit (por ejemplo EXPRESS para logística), si AppGallery la aprobó.
   * Sin ella, Huawei trata los avisos como de baja prioridad y sin sonido en EMUI 10 o superior.
   */
  category?: string;
}

/** Push Kit acepta hasta 1000 tokens por mensaje. */
const BATCH = 1000;

const OK = '80000000';
const PARTIAL = '80100000';
const ALL_TOKENS_INVALID = '80300007';
const AUTH_ERRORS = new Set(['80200001', '80200003']);
const RETRYABLE = new Set(['81000001', '80300002']);

interface HmsResponse {
  code?: string;
  msg?: string;
  requestId?: string;
}

/**
 * Huawei Push Kit (HMS Core), API REST v1: los teléfonos Huawei sin Google reciben los avisos por aquí.
 * https://developer.huawei.com/consumer/en/doc/HMSCore-References/https-send-api-0000001050986197
 */
export class HmsPushGateway extends PushGateway {
  readonly provider = PUSH_PROVIDERS.HMS;
  private cached?: { token: string; expiresAt: number };

  constructor(
    private readonly options: HmsOptions,
    private readonly http: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  async send(message: PushMessage, tokens: string[]): Promise<PushOutcome[]> {
    const outcomes: PushOutcome[] = [];
    for (let start = 0; start < tokens.length; start += BATCH) {
      outcomes.push(...(await this.sendBatch(message, tokens.slice(start, start + BATCH))));
    }
    return outcomes;
  }

  /** Al tocar el aviso, Push Kit abre la app con estos extras; la app los lee en Push.getInitialNotification. */
  clickIntent(message: PushMessage): string {
    const extras = Object.entries(message.data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `S.rc_${key}=${encodeURIComponent(String(value))};`)
      .join('');
    return `intent:#Intent;action=android.intent.action.MAIN;component=${this.options.clickActivity};launchFlags=0x4000000;${extras}end`;
  }

  payload(message: PushMessage, tokens: string[]) {
    return {
      validate_only: false,
      message: {
        data: JSON.stringify(message.data),
        notification: { title: message.title, body: message.body },
        android: {
          urgency: message.highPriority ? 'HIGH' : 'NORMAL',
          ...(this.options.category ? { category: this.options.category } : {}),
          ...(message.tag ? { collapse_key: -1 } : {}),
          notification: {
            title: message.title,
            body: message.body,
            icon: `/raw/${NOTIFICATION_ICON}`,
            color: BRAND_COLOR,
            ...(message.tag ? { tag: message.tag } : {}),
            ...(this.options.category ? { importance: 'NORMAL' } : {}),
            default_sound: true,
            foreground_show: true,
            click_action: { type: 1, intent: this.clickIntent(message) },
          },
        },
        token: tokens,
      },
    };
  }

  private async sendBatch(message: PushMessage, tokens: string[], retriedAuth = false): Promise<PushOutcome[]> {
    const response = await this.http(`https://push-api.cloud.huawei.com/v1/${this.options.appId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify(this.payload(message, tokens)),
      signal: AbortSignal.timeout(10_000),
    });
    const body = ((await response.json().catch(() => ({}))) ?? {}) as HmsResponse;
    const code = body.code ?? `HTTP_${response.status}`;

    if (code === OK) return tokens.map(() => ({ kind: 'sent', providerMessageId: body.requestId }));
    if ((response.status === 401 || AUTH_ERRORS.has(code)) && !retriedAuth) {
      this.cached = undefined;
      return this.sendBatch(message, tokens, true);
    }
    if (code === ALL_TOKENS_INVALID) return tokens.map(() => ({ kind: 'invalidToken', errorCode: code }));
    if (code === PARTIAL) {
      // msg trae {"success":n,"failure":m,"illegal_tokens":[...]}: solo esos se dan de baja.
      const illegal = new Set(this.illegalTokens(body.msg));
      return tokens.map((token) =>
        illegal.has(token) ? { kind: 'invalidToken', errorCode: code } : { kind: 'sent', providerMessageId: body.requestId },
      );
    }
    const retryable = response.status === 429 || response.status >= 500 || RETRYABLE.has(code);
    return tokens.map(() => ({ kind: 'failed', errorCode: code, retryable }));
  }

  private illegalTokens(msg?: string): string[] {
    try {
      return (JSON.parse(msg ?? '{}') as { illegal_tokens?: string[] }).illegal_tokens ?? [];
    } catch {
      return [];
    }
  }

  private async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - 60_000 > this.now()) return this.cached.token;
    const response = await this.http('https://oauth-login.cloud.huawei.com/oauth2/v3/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.options.clientId, client_secret: this.options.clientSecret }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Huawei OAuth respondió ${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.cached = { token: body.access_token, expiresAt: this.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}
