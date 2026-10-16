import type { AccessToken } from "@/core/domain/entities/session";

/**
 * Sesión de la web.
 * - El token de acceso (15 min) vive solo en memoria: nunca en localStorage, así un XSS no puede robarlo después.
 * - El token de refresco (30 días) es una cookie HttpOnly que JavaScript no ve; se renueva con POST /auth/refresh.
 * - `rc.session` en localStorage es solo una pista ("hay sesión") para no llamar a /auth/refresh en cada visita
 *   de alguien que nunca ha entrado, y para cerrar la sesión en las demás pestañas.
 * - La renovación es de un solo vuelo por pestaña y se serializa entre pestañas con Web Locks: el refresco es
 *   rotativo y presentar uno ya usado cierra la sesión (detección de reutilización en la API).
 */
const HINT_KEY = "rc.session";
const LOCK_NAME = "rc.refresh";
const EXPIRY_MARGIN_MS = 30_000;

type Listener = () => void;

class WebSession {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string | null> | null = null;
  private readonly endListeners = new Set<Listener>();

  constructor() {
    if (typeof window === "undefined") return;
    // Otra pestaña cerró sesión: esta también.
    window.addEventListener("storage", (event) => {
      if (event.key === HINT_KEY && event.newValue === null && this.token) this.end();
    });
  }

  get hasHint(): boolean {
    try {
      return localStorage.getItem(HINT_KEY) === "1";
    } catch {
      return false;
    }
  }

  /** Guarda el token recibido al entrar, renovar o cambiar de rol. */
  start(session: AccessToken): void {
    this.token = session.accessToken;
    this.expiresAt = new Date(session.accessTokenExpiresAt).getTime();
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {}
  }

  /** Olvida la sesión local (la revocación en el servidor la hace /auth/sign-out). */
  end(): void {
    const had = this.token !== null || this.hasHint;
    this.token = null;
    this.expiresAt = 0;
    try {
      localStorage.removeItem(HINT_KEY);
    } catch {}
    if (had) this.endListeners.forEach((listener) => listener());
  }

  onEnd(listener: Listener): () => void {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }

  /** Token vigente; si venció (o está por vencer) lo renueva. null = no hay sesión. */
  async accessToken(): Promise<string | null> {
    if (this.token && this.expiresAt - Date.now() > EXPIRY_MARGIN_MS) return this.token;
    if (!this.token && !this.hasHint) return null;
    return this.refresh(this.token);
  }

  /**
   * Renueva el token. `rejected` es el token que la API acaba de rechazar: si mientras tanto otra
   * llamada ya lo renovó, se usa el nuevo sin pedir otro.
   */
  refresh(rejected: string | null = null): Promise<string | null> {
    if (this.token && this.token !== rejected && this.expiresAt - Date.now() > EXPIRY_MARGIN_MS) {
      return Promise.resolve(this.token);
    }
    this.inflight ??= this.withLock(() => this.renew()).finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async withLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    return locks ? locks.request(LOCK_NAME, task) : task();
  }

  private async renew(): Promise<string | null> {
    // Import diferido: api-client importa este módulo.
    const { rawRequest } = await import("../http/api-client");
    try {
      const response = await rawRequest("POST", "/auth/refresh", { body: {} });
      if (response.ok) {
        this.start((await response.json()) as AccessToken);
        return this.token;
      }
      // 401/403: el refresco venció, se revocó o se reutilizó. Otros errores (5xx, 429) no cierran la sesión.
      if (response.status === 401 || response.status === 403) this.end();
      return null;
    } catch {
      return null;
    }
  }
}

export const webSession = new WebSession();
