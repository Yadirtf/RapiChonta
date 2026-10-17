import { webSession } from "../auth/web-session";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

/**
 * Error de la API con su `code` estable (la vista lo traduce con messages/<idioma>.json → errors.<code>).
 * Los errores sin código (validación, red) reciben uno genérico.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }

  get retryAfterSeconds(): number | undefined {
    const value = this.details?.retryAfterSeconds;
    return typeof value === "number" ? value : undefined;
  }
}

export const isApiError = (error: unknown, code?: string): error is ApiError =>
  error instanceof ApiError && (!code || error.code === code);

type Query = Record<string, string | number | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** false en los endpoints públicos: no envía ni renueva el token de acceso. */
  auth?: boolean;
}

export function apiUrl(path: string, query: Query = {}): URL {
  // BASE_URL puede ser relativa ("/api/v1") cuando la web y la API comparten contenedor (Dockerfile raíz).
  const url = new URL(`${BASE_URL}${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  Object.entries(query).forEach(([key, value]) => value !== undefined && value !== "" && url.searchParams.set(key, String(value)));
  return url;
}

const GENERIC_CODES: Record<number, string> = { 400: "VALIDATION_FAILED", 401: "SESSION_INVALID", 403: "PERMISSION_DENIED", 404: "NOT_FOUND", 429: "TOO_MANY_REQUESTS" };

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { code?: string; details?: Record<string, unknown> } | null;
  const code = body?.code ?? GENERIC_CODES[response.status] ?? (response.status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED");
  const retryAfter = Number(response.headers.get("Retry-After"));
  const details = retryAfter > 0 ? { retryAfterSeconds: retryAfter, ...body?.details } : body?.details;
  return new ApiError(response.status, code, details);
}

/** Envía la petición; `credentials: include` deja pasar la cookie de refresco (solo viaja a /api/v1/auth). */
export async function rawRequest(method: string, path: string, options: RequestOptions & { token?: string | null } = {}) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  try {
    return await fetch(apiUrl(path, options.query), {
      method,
      headers,
      credentials: "include",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR");
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Petición a la API. Con `auth` (por defecto) agrega el token de acceso y, si la API responde 401,
 * renueva la sesión una sola vez y repite la petición.
 */
export async function apiRequest<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  if (options.auth === false) return parse<T>(await rawRequest(method, path, options));

  const token = await webSession.accessToken();
  if (!token) throw new ApiError(401, "SESSION_INVALID");
  const response = await rawRequest(method, path, { ...options, token });
  if (response.status !== 401) return parse<T>(response);

  const renewed = await webSession.refresh(token);
  if (!renewed) throw await toApiError(response);
  return parse<T>(await rawRequest(method, path, { ...options, token: renewed }));
}

export const apiGet = <T>(path: string, query: Query = {}, auth = false) => apiRequest<T>("GET", path, { query, auth });

/**
 * Las URLs de archivos que manda la API pueden ser relativas ("/api/v1/files/…", almacenamiento en la base)
 * o absolutas (R2/S3). Las relativas se resuelven contra el origen de la API, no el de la página.
 */
export function resolveApiAsset(url: string | null): string | null {
  if (!url || !url.startsWith("/")) return url;
  return new URL(url, apiUrl("").origin).toString();
}
