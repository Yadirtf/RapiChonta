"use client";

import { Clock3 } from "lucide-react";
import { useBusiness, useOpeningText } from "../../business/BusinessProvider";

/**
 * Aviso de puerta "Abierto / Cerrado" de RapiChonta (H03.2): el mismo cartel colgado de la tienda de barrio,
 * con la hora de cierre o la próxima apertura en la hora del municipio.
 */
export function OpeningSign({ variant = "light", className = "" }: { variant?: "light" | "dark"; className?: string }) {
  const { status } = useBusiness();
  const text = useOpeningText()(status);
  if (!text) return null;
  const open = text.tone === "open";
  const plate = open ? "bg-leaf text-white" : "bg-chonta-strong text-white";
  const sub = variant === "dark" ? "text-white/75" : "text-ink/60";

  return (
    <div className={`flex items-center gap-3 ${className}`} role="status">
      <span className={`door-sign ${variant === "dark" ? "[&::before]:invert" : ""} shrink-0`}>
        <span className={`block rounded-lg px-2.5 py-1 font-display text-[11px] font-extrabold uppercase tracking-[0.12em] shadow-sm ${plate}`}>{text.title}</span>
      </span>
      <span className={`flex min-w-0 items-center gap-1.5 text-xs font-semibold ${sub}`}>
        <Clock3 className="size-3.5 shrink-0" aria-hidden />
        <span className="line-clamp-2 leading-snug">{text.detail}</span>
      </span>
    </div>
  );
}
