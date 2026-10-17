"use client";

import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useTransition, type ReactNode } from "react";
import { Bike, LayoutDashboard, LayoutGrid, User } from "lucide-react";
import { isStaffSession } from "@/core/domain/entities/account";
import { localized, type Category } from "@/core/domain/entities/establishment";
import { LOCALES } from "@/i18n/config";
import { useAuth } from "../../auth/AuthProvider";
import { initials } from "../../format";
import { CategoryIcon } from "../catalog/CategoryIcon";
import { CurrencyPicker } from "../business/CurrencyPicker";
import { OpeningSign } from "../business/OpeningSign";
import { Logo } from "../ui/Logo";

interface Props {
  /** Catálogo de categorías (null mientras carga). */
  categories: Category[] | null;
  /** Códigos elegidos; vacío = todas. */
  active: string[];
  onToggle: (code: string) => void;
  onClear: () => void;
}

const itemClass = "flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white";

export function SideMenu({ categories, active, onToggle, onClear }: Props) {
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
      <nav className="no-scrollbar flex min-h-0 flex-col gap-1 overflow-y-auto px-3">
        <CategoryButton id="all" label={t("menu.all")} active={active.length === 0} onClick={onClear} icon={<LayoutGrid className="size-5" />} />
        {categories === null
          ? Array.from({ length: 5 }, (_, i) => <span key={i} className="mx-1 my-1.5 h-9 animate-pulse rounded-xl bg-white/5" />)
          : categories.map((c) => (
              <CategoryButton
                key={c.code}
                id={c.code}
                label={localized(c.names, locale)}
                active={active.includes(c.code)}
                onClick={() => onToggle(c.code)}
                icon={<CategoryIcon name={c.icon} />}
              />
            ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-white/10 px-3 py-4">
        <div className="hidden px-3 pb-2 md:block" title={t("business.orderingHours")}>
          <OpeningSign variant="dark" />
        </div>
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
        <CurrencyPicker className="px-3" />
        <Link href="/legal/politica-de-datos" className="mt-2 hidden px-3 text-[11px] text-white/35 hover:text-white/70 md:block">
          {t("menu.dataPolicy")}
        </Link>
      </div>
    </aside>
  );
}

function CategoryButton({ id, label, active, onClick, icon }: { id: string; label: string; active: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className="relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-white/5"
    >
      {active && <motion.span layoutId={`pill-${id}`} className="absolute inset-0 rounded-xl bg-brand/15 ring-1 ring-brand/40" />}
      <span className={`relative ${active ? "text-brand" : "text-white/70"}`}>{icon}</span>
      <span className="relative hidden truncate md:inline">{label}</span>
    </button>
  );
}
