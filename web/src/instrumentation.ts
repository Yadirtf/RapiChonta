import type { Instrumentation } from "next";

/** Errores del servidor de Next.js (render y rutas) a Sentry. Usa el mismo DSN público que el navegador. */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || process.env.NEXT_RUNTIME !== "nodejs") return;
  const [Sentry, { sentryOptions }] = await Promise.all([import("@sentry/nextjs"), import("@/infrastructure/observability/sentry")]);
  Sentry.init(sentryOptions(dsn));
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
