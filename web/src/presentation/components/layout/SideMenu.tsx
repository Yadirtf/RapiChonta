"use client";

import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Bike, Home, Package, Pill, ShoppingBasket, Store, User, UtensilsCrossed } from "lucide-react";
import type { EstablishmentCategory } from "@/core/domain/entities/establishment";
import { LOCALES } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

const CATEGORIES: { id: EstablishmentCategory; icon: typeof Home }[] = [
  { id: "FAST_FOOD", icon: UtensilsCrossed },
  { id: "RESTAURANT", icon: Store },
  { id: "SUPERMARKET", icon: ShoppingBasket },
  { id: "STORE", icon: Package },
  { id: "PHARMACY", icon: Pill },
];

const SECONDARY = [
  { key: "myOrders", icon: Bike },
  { key: "myAccount", icon: User },
];

interface Props {
  active: EstablishmentCategory[];
  onToggle: (category: EstablishmentCategory) => void;
}

export function SideMenu({ active, onToggle }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const changeLocale = (next: string) =>
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });

  return (
    <aside className="flex h-full w-20 shrink-0 flex-col bg-ink text-white md:w-64">
      <div className="flex items-center gap-2 px-4 py-6">
        <span className="grid size-10 place-items-center rounded-2xl bg-brand text-lg font-black text-ink">R</span>
        <span className="hidden text-xl font-extrabold tracking-tight md:block">
          Rapi<span className="text-brand">Chonta</span>
        </span>
      </div>

      <p className="hidden px-5 pb-2 text-xs font-semibold uppercase tracking-widest text-white/40 md:block">{t("menu.explore")}</p>
      <nav className="flex flex-col gap-1 px-3">
        {CATEGORIES.map(({ id, icon: Icon }) => {
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
              <span className="relative hidden md:inline">{t(`categories.${id}`)}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-white/10 px-3 py-4">
        {SECONDARY.map(({ key, icon: Icon }) => (
          <button key={key} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/70 hover:bg-white/5">
            <Icon className="size-5" />
            <span className="hidden md:inline">{t(`menu.${key}`)}</span>
          </button>
        ))}
        <div role="group" aria-label={t("menu.language")} className="mt-2 flex gap-1 px-3">
          {LOCALES.map((l) => (
            <button
              key={l}
              disabled={pending}
              onClick={() => changeLocale(l)}
              aria-pressed={l === locale}
              className={`rounded-lg px-2 py-1 text-xs font-bold uppercase ${l === locale ? "bg-brand text-ink" : "text-white/60 hover:bg-white/5"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
