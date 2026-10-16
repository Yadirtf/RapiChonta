import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink/60">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[28px] border-2 border-dashed border-ink/10 px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-white text-ink/40 shadow-sm">{icon}</span>
      <p className="mt-4 font-bold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink/55">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
