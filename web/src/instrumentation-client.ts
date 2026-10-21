import { SENTRY_DSN, sentryOptions } from "@/infrastructure/observability/sentry";

// Errores del navegador (H05.4). Sin DSN no se descarga el SDK.
const dsn = SENTRY_DSN;
if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => Sentry.init(sentryOptions(dsn)));
}
