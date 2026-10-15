const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function apiGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  // BASE_URL puede ser relativa ("/api/v1") cuando la web y la API comparten contenedor (Dockerfile raíz).
  const url = new URL(`${BASE_URL}${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  Object.entries(params).forEach(([key, value]) => value !== undefined && url.searchParams.set(key, String(value)));

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new ApiError(response.status, `Error ${response.status} al consultar ${path}`);
  return response.json() as Promise<T>;
}
