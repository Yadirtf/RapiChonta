import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "../ui/Logo";

/**
 * Marco de las páginas del cliente fuera del mapa (pedido, mis pedidos): el toldo de la tienda de barrio,
 * la flecha de regreso y el título junto a la mascota.
 */
export function StorePage({ back, backLabel, title, aside, children, width = "max-w-6xl" }: {
  back: string;
  backLabel: string;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  return (
    <main className="min-h-dvh bg-surface">
      <div className="awning h-14 sm:h-16" aria-hidden />
      <div className={`mx-auto px-4 sm:px-6 ${width}`}>
        <nav className="relative z-10 -mt-7 flex items-center gap-3 sm:-mt-8">
          <Link href={back} aria-label={backLabel} className="grid size-11 shrink-0 place-items-center rounded-full bg-white shadow-lg transition hover:scale-105">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        </nav>
        <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark className="size-12 ring-4 ring-white" />
            <h1 className="min-w-0 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          </div>
          {aside}
        </header>
        {children}
      </div>
    </main>
  );
}

/** Tarjeta de puerta (canasta vacía, ingreso, pedido no encontrado): toldo pequeño, un ícono y una sola acción. */
export function DoorCard({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="mx-auto mt-10 w-full max-w-md overflow-hidden rounded-[28px] bg-white text-center shadow-xl">
      <div className="awning awning-sm h-6" aria-hidden />
      <div className="flex flex-col items-center p-7 pt-9">
        <span className="grid size-16 place-items-center rounded-3xl bg-brand/25 text-chonta-strong">{icon}</span>
        <h2 className="mt-4 font-display text-2xl font-extrabold tracking-tight">{title}</h2>
        <p className="mt-1.5 max-w-xs text-sm text-ink/60">{body}</p>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}
