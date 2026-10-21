import { Check } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Paso del pedido como renglón numerado de la comanda: el número en un sello de chontaduro que se
 * vuelve hoja cuando el paso ya está listo.
 */
export function StepCard({ number, title, done, children, aside }: { number: number; title: string; done: boolean; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-[0_1px_0_rgb(20_18_31/0.06),0_12px_32px_-18px_rgb(20_18_31/0.25)] sm:p-6" aria-labelledby={`step-${number}`}>
      <header className="mb-4 flex items-center gap-3">
        <span
          className={`grid size-9 shrink-0 -rotate-6 place-items-center rounded-xl font-display text-lg font-extrabold transition-colors ${done ? "bg-leaf text-white" : "bg-chonta text-white"}`}
          aria-hidden
        >
          {done ? <Check className="size-5" strokeWidth={3} /> : number}
        </span>
        <h2 id={`step-${number}`} className="min-w-0 flex-1 font-display text-xl font-extrabold leading-tight tracking-tight">
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Ficha seleccionable (lugar guardado, medio de pago, destinatario): marco de tinta cuando está elegida. */
export function ChoiceChip({ selected, onClick, children, className = "" }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-2xl border-2 px-3.5 py-2.5 text-left text-sm font-bold outline-none transition focus-visible:ring-4 focus-visible:ring-brand/40 active:scale-[0.98] ${
        selected ? "border-ink bg-brand/25 text-ink" : "border-ink/10 bg-white text-ink/75 hover:border-ink/25"
      } ${className}`}
    >
      {children}
    </button>
  );
}
