"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Ancho máximo en escritorio. */
  size?: "sm" | "md" | "lg";
  /** Sin botón de cerrar ni cierre con Escape/clic afuera (pasos obligatorios). */
  dismissible?: boolean;
  closeLabel?: string;
  /** Panel lateral en escritorio (formularios largos del panel). */
  side?: boolean;
}

// Portal solo en el navegador: en el servidor no hay document.body.
const noop = () => () => {};
const isClient = () => true;
const isServer = () => false;

const SIZES = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };

/** Diálogos abiertos, del más antiguo al más reciente: solo el de arriba responde al teclado. */
const openStack: string[] = [];

/**
 * Diálogo accesible: hoja inferior en el teléfono, ventana centrada (o panel lateral) en escritorio.
 * Atrapa el foco, cierra con Escape y devuelve el foco a quien lo abrió.
 */
export function Dialog({ open, onClose, title, description, children, size = "sm", dismissible = true, closeLabel = "Cerrar", side = false }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(noop, isClient, isServer);

  useEffect(() => {
    if (!open) return;
    openStack.push(titleId);
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const target = panel.current?.querySelector<HTMLElement>("[data-autofocus], input, select, textarea, button:not([data-close])");
      (target ?? panel.current)?.focus();
    }, 60);

    const onKey = (event: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== titleId) return;
      if (event.key === "Escape" && dismissible) onClose?.();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      openStack.splice(openStack.indexOf(titleId), 1);
      if (!openStack.length) document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, dismissible, onClose, titleId]);

  const desktop = side
    ? "sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:max-h-none sm:w-full sm:max-w-xl sm:rounded-none sm:rounded-l-[28px]"
    : `sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] ${SIZES[size]}`;

  if (!mounted) return null;
  // Portal: un diálogo dentro de otro (o de un elemento animado) no hereda su posición.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissible && onClose?.()}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={side ? { x: 40, opacity: 0 } : { y: 32, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={side ? { x: 40, opacity: 0 } : { y: 32, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={`absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl outline-none sm:bottom-auto ${desktop}`}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden />
            <header className="flex items-start gap-4 px-6 pb-2 pt-5 sm:pt-6">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-xl font-extrabold tracking-tight text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm text-ink/60">
                    {description}
                  </p>
                )}
              </div>
              {dismissible && (
                <button
                  data-close
                  onClick={onClose}
                  aria-label={closeLabel}
                  className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-ink/50 transition hover:bg-ink/5 hover:text-ink"
                >
                  <X className="size-5" />
                </button>
              )}
            </header>
            <div className="overflow-y-auto px-6 pb-6 pt-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
