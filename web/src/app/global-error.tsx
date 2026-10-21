"use client";

import { useEffect } from "react";
import { reportError } from "@/infrastructure/observability/sentry";
import { ErrorScreen } from "@/presentation/views/ErrorScreen";
import "./globals.css";

/*
 * Último recurso: falló el propio layout raíz, así que no hay traducciones cargadas. Los textos van aquí en los
 * dos idiomas (los mismos de messages/*.json, "errorPage") y se elige por el idioma del navegador.
 */
const TEXT = {
  es: { title: "Se nos regó el canasto", body: "Algo falló de nuestro lado mientras cargábamos esta pantalla. Tu pedido y tu cuenta están bien.", retry: "Intentar de nuevo", home: "Ir al inicio", code: "Código para soporte:" },
  en: { title: "We dropped the basket", body: "Something failed on our side while loading this screen. Your order and your account are fine.", retry: "Try again", home: "Go home", code: "Support code:" },
};

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  const language = typeof navigator !== "undefined" && navigator.language.startsWith("en") ? "en" : "es";
  const text = TEXT[language];
  return (
    <html lang={language}>
      <body className="font-sans antialiased">
        <ErrorScreen onRetry={reset} text={{ ...text, code: error.digest ? `${text.code} ${error.digest}` : null }} />
      </body>
    </html>
  );
}
