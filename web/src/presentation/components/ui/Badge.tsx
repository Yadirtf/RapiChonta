import type { ReactNode } from "react";

const TONES = {
  neutral: "bg-ink/5 text-ink/70",
  brand: "bg-brand/20 text-[#8a5300]",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
  dark: "bg-ink text-white",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, dot = false }: { tone?: BadgeTone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
