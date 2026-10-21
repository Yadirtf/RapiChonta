"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { reportError } from "@/infrastructure/observability/sentry";
import { ErrorScreen } from "@/presentation/views/ErrorScreen";

/** Error en una pantalla: se reporta a Sentry y el cliente puede reintentar sin perder la sesión ni la canasta. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  useEffect(() => reportError(error), [error]);
  return (
    <ErrorScreen
      onRetry={reset}
      text={{ title: t("title"), body: t("body"), retry: t("retry"), home: t("home"), code: error.digest ? t("code", { digest: error.digest }) : null }}
    />
  );
}
