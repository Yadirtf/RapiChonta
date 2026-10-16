"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { ApiError } from "@/infrastructure/http/api-client";

/**
 * Traduce un error de la API por su `code` (messages → errors.<code>). Los textos pueden usar
 * {minutes} (espera antes de reintentar), {remaining} (intentos que quedan) y {field} (dato repetido).
 */
export function useErrorMessage() {
  const t = useTranslations("errors");
  return useCallback(
    (error: unknown): string => {
      const code = error instanceof ApiError ? error.code : "UNKNOWN";
      const details = error instanceof ApiError ? error.details : undefined;
      const retry = error instanceof ApiError ? error.retryAfterSeconds : undefined;
      const values = {
        minutes: Math.max(1, Math.ceil((retry ?? 60) / 60)),
        remaining: typeof details?.remainingAttempts === "number" ? details.remainingAttempts : 0,
        field: typeof details?.field === "string" ? details.field : "other",
      };
      return t.has(code) ? t(code, values) : t("UNKNOWN");
    },
    [t],
  );
}
