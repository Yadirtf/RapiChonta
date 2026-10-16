import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

const TONES = {
  error: { box: "bg-red-50 text-red-800 ring-red-200", icon: AlertCircle },
  success: { box: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: CheckCircle2 },
  info: { box: "bg-brand/10 text-ink ring-brand/40", icon: Info },
} as const;

export function Alert({ tone = "error", children, className = "" }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm ring-1 ${box} ${className}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
