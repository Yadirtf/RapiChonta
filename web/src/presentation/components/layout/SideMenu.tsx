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
import { LogoEmblem } from "../ui/Logo";
import { SidebarBackdrop } from "./SidebarBackdrop";

interface Props {
  /** Catálogo de categorías (null mientras carga). */
  categories: Category[] | null;
  /** Códigos elegidos; vacío = todas. */
  active: string[];
  onToggle: (code: string) => void;
  onClear: () => void;
}

// Mismo ítem que el menú de la app: píldora amplia, ícono claro y texto blanco.
const itemClass =
  "relative flex shrink-0 items-center justify-center gap-4 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-white transition-colors hover:bg-white/10 md:justify-start md:px-4";

export function SideMenu({ categories, active, onToggle, onClear }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const { account, changeLanguage } = useAuth();
  const [pending, startTransition] = useTransition();

  return (
    <aside className="relative isolate flex h-full w-20 shrink-0 flex-col bg-ink text-white md:w-72">
      <SidebarBackdrop />
      {/* El emblema crece solo si la pantalla es alta: en portátiles de 600-700 px el espacio es para las categorías. */}
      <div className="flex shrink-0 justify-center px-2 pb-3 pt-5 tall:pb-4 tall:pt-7">
        <LogoEmblem priority className="w-14 md:w-24 md:tall:w-32" />
      </div>

      <nav
        aria-label={t("menu.explore")}
        className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-1 [mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-20px),transparent)]"
      >
        <CategoryButton id="all" label={t("menu.all")} active={active.length === 0} onClick={onClear} icon={<LayoutGrid className="size-5" />} />
        {categories === null
          ? Array.from({ length: 5 }, (_, i) => <span key={i} className="mx-1 my-1 h-11 shrink-0 animate-pulse rounded-2xl bg-white/10" />)
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

      <div className="flex shrink-0 flex-col gap-1 border-t border-white/15 px-3 pb-4 pt-3">
        <div className="hidden px-4 pb-1 md:block" title={t("business.orderingHours")}>
          <OpeningSign variant="dark" />
        </div>
        <CurrencyPicker className="py-1 md:px-4" />
        {isStaffSession(account) && (
          <Link href="/panel" className={itemClass} title={t("menu.panel")}>
            <LayoutDashboard className="size-5 shrink-0 text-white/80" />
            <span className="hidden md:inline">{t("menu.panel")}</span>
          </Link>
        )}
        <button className={itemClass} title={t("menu.myOrders")}>
          <Bike className="size-5 shrink-0 text-white/80" />
          <span className="hidden md:inline">{t("menu.myOrders")}</span>
        </button>
        <Link href="/cuenta" className={itemClass} title={t("menu.myAccount")}>
          {account ? (
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-extrabold text-ink">
              {initials(account.givenNames, account.familyNames)}
            </span>
          ) : (
            <User className="size-5 shrink-0 text-white/80" />
          )}
          <span className="hidden truncate md:inline">{account ? account.givenNames : t("menu.myAccount")}</span>
        </Link>
        <div className="mt-1 flex flex-col items-center gap-2 md:flex-row md:justify-between md:px-4">
          <Link href="/legal/politica-de-datos" className="hidden text-xs text-white/70 hover:text-white hover:underline md:block">
            {t("menu.dataPolicy")}
          </Link>
          <div role="group" aria-label={t("menu.language")} className="flex flex-col gap-1 rounded-full md:flex-row md:p-0.5 md:ring-1 md:ring-white/25">
            {LOCALES.map((l) => (
              <button
                key={l}
                disabled={pending}
                onClick={() => startTransition(() => changeLanguage(l))}
                aria-pressed={l === locale}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase transition-colors ${l === locale ? "bg-brand text-ink" : "text-white/80 hover:bg-white/10"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function CategoryButton({ id, label, active, onClick, icon }: { id: string; label: string; active: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} title={label} className={itemClass}>
      {active && <motion.span layoutId={`pill-${id}`} className="absolute inset-0 rounded-2xl bg-brand/15 ring-1 ring-brand/40" />}
      <span className={`relative shrink-0 ${active ? "text-brand" : "text-white/80"}`}>{icon}</span>
      <span className="relative hidden truncate md:inline">{label}</span>
    </button>
  );
}
