"use client";

import { RotateCcw } from "lucide-react";
import { LogoEmblem } from "@/presentation/components/ui/Logo";

export interface ErrorScreenText {
  title: string;
  body: string;
  retry: string;
  home: string;
  code: string | null;
}

/**
 * Pantalla de error con la marca: la chonta en su moto sobre el crema de la casa, el aviso en letra de letrero
 * y dos salidas claras. No muestra detalles técnicos; solo el código que sirve para encontrarlo en Sentry.
 */
export function ErrorScreen({ text, onRetry }: { text: ErrorScreenText; onRetry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-cream px-6 py-12 text-ink">
      <div className="flex max-w-md flex-col items-center text-center">
        <LogoEmblem className="w-36 -rotate-3" priority />
        <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{text.title}</h1>
        <p className="mt-3 text-base text-ink/70">{text.body}</p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={onRetry}
            className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-brand px-6 font-bold text-ink shadow-[0_6px_0_var(--color-chonta-strong)] transition active:translate-y-1 active:shadow-[0_2px_0_var(--color-chonta-strong)]"
          >
            <RotateCcw className="size-5" aria-hidden />
            {text.retry}
          </button>
          {/* Carga completa (no navegación del cliente): si el error vino del enrutador, así sale limpio. */}
          <button
            onClick={() => window.location.assign("/")}
            className="inline-flex h-13 items-center justify-center rounded-2xl px-6 font-bold text-ink/75 ring-1 ring-ink/15 transition hover:bg-white"
          >
            {text.home}
          </button>
        </div>
        {text.code && <p className="mt-8 font-mono text-xs text-ink/45">{text.code}</p>}
      </div>
    </main>
  );
}
