import { createSign } from 'node:crypto';

/** Cuenta de servicio de Firebase (el JSON que se descarga en Configuración del proyecto → Cuentas de servicio). */
export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/**
 * Token OAuth2 para FCM HTTP v1 firmado con la cuenta de servicio (JWT RS256), sin el SDK de Firebase.
 * Se guarda hasta un minuto antes de vencer; varias peticiones simultáneas comparten la misma renovación.
 */
export class GoogleAccessToken {
  private cached?: { token: string; expiresAt: number };
  private inflight?: Promise<string>;

  constructor(
    private readonly account: ServiceAccount,
    private readonly http: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  get(): Promise<string> {
    if (this.cached && this.cached.expiresAt - 60_000 > this.now()) return Promise.resolve(this.cached.token);
    return (this.inflight ??= this.fetchToken().finally(() => (this.inflight = undefined)));
  }

  /** El proveedor rechazó el token (401): se pide otro en el siguiente envío. */
  reset(): void {
    this.cached = undefined;
  }

  private async fetchToken(): Promise<string> {
    const tokenUri = this.account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const issuedAt = Math.floor(this.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({ iss: this.account.client_email, scope: SCOPE, aud: tokenUri, iat: issuedAt, exp: issuedAt + 3600 }));
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(this.account.private_key);
    const response = await this.http(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${base64url(signature)}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Google OAuth respondió ${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.cached = { token: body.access_token, expiresAt: this.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}

/** Acepta el JSON tal cual o en base64 (más cómodo en variables de entorno de una sola línea). */
export function parseServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const account = JSON.parse(text) as ServiceAccount;
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error('FCM_SERVICE_ACCOUNT no es una cuenta de servicio válida (faltan project_id, client_email o private_key)');
  }
  return { ...account, private_key: account.private_key.replace(/\\n/g, '\n') };
}
