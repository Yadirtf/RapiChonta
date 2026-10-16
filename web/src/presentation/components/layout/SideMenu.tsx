"use client";

import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useTransition } from "react";
import { Bike, Home, LayoutDashboard, Package, Pill, ShoppingBasket, Store, User, UtensilsCrossed } from "lucide-react";
import { isStaffSession } from "@/core/domain/entities/account";
import type { EstablishmentCategory } from "@/core/domain/entities/establishment";
import { LOCALES } from "@/i18n/config";
import { useAuth } from "../../auth/AuthProvider";
import { initials } from "../../format";
import { Logo } from "../ui/Logo";

const CATEGORIES: { id: EstablishmentCategory; icon: typeof Home }[] = [
  { id: "FAST_FOOD", icon: UtensilsCrossed },
  { id: "RESTAURANT", icon: Store },
  { id: "SUPERMARKET", icon: ShoppingBasket },
  { id: "STORE", icon: Package },
  { id: "PHARMACY", icon: Pill },
];

interface Props {
  active: EstablishmentCategory[];
  onToggle: (category: EstablishmentCategory) => void;
}

const itemClass = "flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white";

export function SideMenu({ active, onToggle }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const { account, changeLanguage } = useAuth();
  const [pending, startTransition] = useTransition();

  return (
    <aside className="flex h-full w-20 shrink-0 flex-col bg-ink text-white md:w-64">
      <div className="px-4 py-6">
        <span className="md:hidden">
          <Logo compact />
        </span>
        <span className="hidden md:inline">
          <Logo />
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
              title={t(`categories.${id}`)}
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
        {isStaffSession(account) && (
          <Link href="/panel" className={itemClass} title={t("menu.panel")}>
            <LayoutDashboard className="size-5" />
            <span className="hidden md:inline">{t("menu.panel")}</span>
          </Link>
        )}
        <button className={itemClass} title={t("menu.myOrders")}>
          <Bike className="size-5" />
          <span className="hidden md:inline">{t("menu.myOrders")}</span>
        </button>
        <Link href="/cuenta" className={itemClass} title={t("menu.myAccount")}>
          {account ? (
            <span className="grid size-6 place-items-center rounded-full bg-brand text-[11px] font-extrabold text-ink">
              {initials(account.givenNames, account.familyNames)}
            </span>
          ) : (
            <User className="size-5" />
          )}
          <span className="hidden truncate md:inline">{account ? account.givenNames : t("menu.myAccount")}</span>
        </Link>
        <div role="group" aria-label={t("menu.language")} className="mt-2 flex flex-col gap-1 px-3 md:flex-row">
          {LOCALES.map((l) => (
            <button
              key={l}
              disabled={pending}
              onClick={() => startTransition(() => changeLanguage(l))}
              aria-pressed={l === locale}
              className={`rounded-lg px-2 py-1 text-xs font-bold uppercase ${l === locale ? "bg-brand text-ink" : "text-white/60 hover:bg-white/5"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <Link href="/legal/politica-de-datos" className="mt-2 hidden px-3 text-[11px] text-white/35 hover:text-white/70 md:block">
          {t("menu.dataPolicy")}
        </Link>
      </div>
    </aside>
  );
}
