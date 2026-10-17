"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Clock3, MapPin, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { cartCount } from "@/core/domain/entities/cart";
import { localized, type Establishment } from "@/core/domain/entities/establishment";
import { useCart } from "../cart/CartProvider";
import { CartBar } from "../components/cart/CartBar";
import { CategoryIcon } from "../components/catalog/CategoryIcon";
import { SideMenu } from "../components/layout/SideMenu";
import { useCatalogFormat } from "../hooks/useCatalogFormat";
import { useCategories } from "../hooks/useCategories";
import { useGeolocation } from "../hooks/useGeolocation";
import { useNearbyEstablishments } from "../hooks/useNearbyEstablishments";

// MapLibre usa APIs del navegador: se carga solo en cliente.
const NearbyMap = dynamic(() => import("../components/map/NearbyMap").then((m) => m.NearbyMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface" />,
});

export function HomeView() {
  const t = useTranslations();
  const locale = useLocale();
  const format = useCatalogFormat();
  const { categories } = useCategories();
  const { cart } = useCart();
  const [active, setActive] = useState<string[]>([]);
  const [selected, setSelected] = useState<Establishment | null>(null);
  const { position, status } = useGeolocation();
  const { data, error, loading } = useNearbyEstablishments(position, active, status !== "loading");
  const names = useMemo(() => new Map((categories ?? []).map((c) => [c.code, localized(c.names, locale)])), [categories, locale]);

  const toggle = (code: string) => setActive((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  const onSelect = useCallback((e: Establishment) => setSelected(e), []);
  const hasCart = cartCount(cart) > 0;

  return (
    <main className="flex h-dvh w-full overflow-hidden">
      <SideMenu categories={categories} active={active} onToggle={toggle} onClear={() => setActive([])} />

      <section className="relative flex-1">
        <NearbyMap center={position} establishments={data} selectedId={selected?.id} onSelect={onSelect} />

        <header className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm shadow-lg backdrop-blur">
            <MapPin className="size-4 text-brand-strong" />
            {status === "denied" ? t("map.enableLocation") : t("map.nearYou")}
            <span className="font-semibold">· {loading ? t("map.searching") : t("map.places", { count: data.length })}</span>
          </div>
        </header>

        {error && (
          <p role="alert" className="absolute left-1/2 top-20 -translate-x-1/2 rounded-xl bg-red-600 px-4 py-2 text-sm text-white shadow">
            {t(`errors.${error}`)}
          </p>
        )}

        <AnimatePresence>
          {selected && (
            <motion.article
              key={selected.id}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className={`absolute inset-x-4 mx-auto max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ${hasCart ? "bottom-28" : "bottom-4"}`}
            >
              <div className={`awning awning-sm h-4 ${selected.acceptsOrders ? "" : "[--awning-a:#9b98a3]"}`} aria-hidden />
              <div className="p-5 pt-6">
                <button onClick={() => setSelected(null)} aria-label={t("establishment.close")} className="absolute right-3 top-7 grid size-8 place-items-center rounded-full text-ink/50 hover:bg-ink/5">
                  <X className="size-5" />
                </button>
                <div className="flex items-start gap-3">
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink text-brand">
                    {selected.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.logoUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <CategoryIcon name={selected.categoryIcon} className="size-7" />
                    )}
                  </span>
                  <div className="min-w-0 pr-8">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-strong">
                      {names.get(selected.category) ?? ""} · {format.distance(selected.distanceMeters)}
                    </p>
                    <h2 className="mt-0.5 font-display text-xl font-extrabold leading-tight text-ink">{selected.name}</h2>
                    <p className="truncate text-sm text-ink/60">{selected.address}</p>
                  </div>
                </div>
                {selected.acceptsOrders ? (
                  <Link
                    href={`/local/${selected.id}`}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 font-bold text-ink transition-transform active:scale-[0.98]"
                  >
                    {t("establishment.orderHere")} <ArrowRight className="size-4" aria-hidden />
                  </Link>
                ) : (
                  <Link
                    href={`/local/${selected.id}`}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-surface py-3 font-bold text-ink/70"
                  >
                    <Clock3 className="size-4" aria-hidden /> {t("establishment.closedSeeMenu")}
                  </Link>
                )}
                <p className="mt-2 text-center text-xs text-ink/50">{t("establishment.courierBuysForYou")}</p>
              </div>
            </motion.article>
          )}
        </AnimatePresence>
        <CartBar className="left-20 md:left-64" />
      </section>
    </main>
  );
}
