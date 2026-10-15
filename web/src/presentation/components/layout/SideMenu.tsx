"use client";

import { motion } from "framer-motion";
import { Bike, Home, Package, Pill, ShoppingBasket, Store, User, UtensilsCrossed } from "lucide-react";
import type { EstablishmentCategory } from "@/core/domain/entities/establishment";

const CATEGORIES: { id: EstablishmentCategory; label: string; icon: typeof Home }[] = [
  { id: "FAST_FOOD", label: "Comida rápida", icon: UtensilsCrossed },
  { id: "RESTAURANT", label: "Restaurantes", icon: Store },
  { id: "SUPERMARKET", label: "Supermercados", icon: ShoppingBasket },
  { id: "STORE", label: "Tiendas", icon: Package },
  { id: "PHARMACY", label: "Farmacias", icon: Pill },
];

const SECONDARY = [
  { label: "Mis pedidos", icon: Bike },
  { label: "Mi cuenta", icon: User },
];

interface Props {
  active: EstablishmentCategory[];
  onToggle: (category: EstablishmentCategory) => void;
}

export function SideMenu({ active, onToggle }: Props) {
  return (
    <aside className="flex h-full w-20 shrink-0 flex-col bg-ink text-white md:w-64">
      <div className="flex items-center gap-2 px-4 py-6">
        <span className="grid size-10 place-items-center rounded-2xl bg-brand text-lg font-black text-ink">R</span>
        <span className="hidden text-xl font-extrabold tracking-tight md:block">
          Rapi<span className="text-brand">Chonta</span>
        </span>
      </div>

      <p className="hidden px-5 pb-2 text-xs font-semibold uppercase tracking-widest text-white/40 md:block">Explorar</p>
      <nav className="flex flex-col gap-1 px-3">
        {CATEGORIES.map(({ id, label, icon: Icon }) => {
          const isActive = active.includes(id);
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              aria-pressed={isActive}
              className="relative flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-white/5"
            >
              {isActive && (
                <motion.span layoutId={`pill-${id}`} className="absolute inset-0 rounded-xl bg-brand/15 ring-1 ring-brand/40" />
              )}
              <Icon className={`relative size-5 ${isActive ? "text-brand" : "text-white/70"}`} />
              <span className="relative hidden md:inline">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-white/10 px-3 py-4">
        {SECONDARY.map(({ label, icon: Icon }) => (
          <button key={label} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/70 hover:bg-white/5">
            <Icon className="size-5" />
            <span className="hidden md:inline">{label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
