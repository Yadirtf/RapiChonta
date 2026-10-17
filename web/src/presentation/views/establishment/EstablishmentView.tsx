"use client";

import { ArrowLeft, MapPin, Navigation, Search, ShoppingBasket, Store } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { belongsToOther, quantityOf, reconcileCart } from "@/core/domain/entities/cart";
import { distanceMeters, localized, type EstablishmentDetail, type MenuProduct } from "@/core/domain/entities/establishment";
import { container } from "@/infrastructure/di/container";
import { isApiError } from "@/infrastructure/http/api-client";
import { useCart } from "../../cart/CartProvider";
import { CartBar } from "../../components/cart/CartBar";
import { CategoryIcon } from "../../components/catalog/CategoryIcon";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import { useCategories } from "../../hooks/useCategories";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { useResource } from "../../hooks/useResource";
import { ProductCard } from "./ProductCard";

/** Página del local (H02.5): toldo, letrero, menú por secciones y canasta de un solo establecimiento. */
export function EstablishmentView({ id }: { id: string }) {
  const t = useTranslations("store");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const format = useCatalogFormat();
  const { categories } = useCategories();
  const { position, status: geoStatus } = useGeolocation();
  // La distancia se calcula aquí: así el menú no espera (ni se vuelve a pedir) por el permiso de ubicación.
  const { data, error, loading } = useResource(() => container.establishments.findById(id, { language: locale }), [id, locale]);
  const { cart, add, setQuantity, replace } = useCart();
  const [pending, setPending] = useState<MenuProduct | null>(null);
  const [notice, setNotice] = useState<{ removed: string[]; repriced: string[] } | null>(null);
  const [query, setQuery] = useState("");

  // La canasta guardada puede tener precios viejos o productos que ya no se venden.
  useEffect(() => {
    if (!data || !cart || cart.establishmentId !== data.id) return;
    const result = reconcileCart(cart, data);
    if (result.removed.length || result.repriced.length) {
      replace(result.cart);
      setNotice({ removed: result.removed, repriced: result.repriced });
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => {
    if (!data) return [];
    const q = normalize(query);
    if (!q) return data.sections;
    return data.sections
      .map((s) => ({ ...s, products: s.products.filter((p) => normalize(`${p.name} ${p.description ?? ""}`).includes(q)) }))
      .filter((s) => s.products.length);
  }, [data, query]);

  if (loading && !data) return <StoreSkeleton />;
  if (error || !data) {
    const notFound = isApiError(error, "ESTABLISHMENT_NOT_FOUND") || isApiError(error, "NOT_FOUND");
    return (
      <main className="grid min-h-dvh place-items-center bg-surface p-6">
        <div className="w-full max-w-sm overflow-hidden rounded-[28px] bg-white text-center shadow-xl">
          <div className="awning h-8 [--awning-a:#9b98a3]" aria-hidden />
          <div className="p-7 pt-9">
            <Store className="mx-auto size-10 text-ink/30" aria-hidden />
            <h1 className="mt-3 font-display text-2xl font-extrabold">{notFound ? t("notFoundTitle") : t("errorTitle")}</h1>
            <p className="mt-1 text-sm text-ink/60">{notFound ? t("notFoundBody") : errorMessage(error)}</p>
            <Link href="/" className="mt-6 inline-flex h-11 items-center gap-2 rounded-2xl bg-brand px-5 font-bold">
              <ArrowLeft className="size-4" aria-hidden /> {t("backToMap")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const primary = data.categories.find((c) => c.primary) ?? data.categories[0];
  const categoryName = (code: string) => localized(categories?.find((c) => c.code === code)?.names, locale);
  const lineFor = (p: MenuProduct) => ({ productId: p.id, versionId: p.versionId, name: p.name, price: p.price, imageUrl: p.imageUrl });
  const onAdd = (p: MenuProduct) => (belongsToOther(cart, data.id) ? setPending(p) : add(data, lineFor(p)));
  const productCount = data.sections.reduce((n, s) => n + s.products.length, 0);
  const distance = geoStatus === "granted" ? distanceMeters(position, data.location) : null;

  return (
    <main className="min-h-dvh bg-surface pb-36">
      <div className="awning h-14 sm:h-16" aria-hidden />

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <nav className="relative z-10 -mt-7 flex items-center justify-between sm:-mt-8">
          <Link href="/" aria-label={t("backToMap")} className="grid size-11 place-items-center rounded-full bg-white shadow-lg transition hover:scale-105">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        </nav>

        <header className="relative mt-4 overflow-hidden rounded-[30px] bg-ink p-6 text-white shadow-xl sm:p-8">
          <div className="pointer-events-none absolute -right-8 -top-10 text-white/[0.04]" aria-hidden>
            <CategoryIcon name={primary?.icon} className="size-64" strokeWidth={1} />
          </div>
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand text-ink ring-4 ring-white/10 sm:size-20">
                {data.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <CategoryIcon name={primary?.icon} className="size-8 sm:size-9" />
                )}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  {data.categories.map((c) => (
                    <span key={c.code} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand">
                      <CategoryIcon name={c.icon} className="size-3.5" /> {categoryName(c.code)}
                    </span>
                  ))}
                </div>
                <h1 className="mt-2 font-display text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-4xl">{data.name}</h1>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-white/65">
                  <MapPin className="size-4 shrink-0" aria-hidden /> {data.address}
                  {distance !== null && (
                    <span className="inline-flex items-center gap-1 text-white/45">
                      · <Navigation className="size-3.5" aria-hidden /> {format.distance(distance)}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <DoorSign open={data.acceptsOrders} />
          </div>
        </header>

        {!data.acceptsOrders && (
          <Alert tone="info" className="mt-4">
            {t("closedBody")}
          </Alert>
        )}
        {notice && (
          <Alert tone="info" className="mt-4">
            {notice.removed.length > 0 && <p>{t("cartRemoved", { names: notice.removed.join(", ") })}</p>}
            {notice.repriced.length > 0 && <p>{t("cartRepriced", { names: notice.repriced.join(", ") })}</p>}
          </Alert>
        )}

        {productCount === 0 ? (
          <div className="mt-10 rounded-[28px] border-2 border-dashed border-ink/10 px-6 py-14 text-center">
            <ShoppingBasket className="mx-auto size-10 text-ink/25" aria-hidden />
            <p className="mt-3 font-bold">{t("emptyMenu")}</p>
          </div>
        ) : (
          <MenuSections
            sections={sections}
            allSections={data.sections}
            query={query}
            onQuery={setQuery}
            render={(p) => (
              <ProductCard
                key={p.id}
                product={p}
                quantity={cart?.establishmentId === data.id ? quantityOf(cart, p.id) : 0}
                canOrder={data.acceptsOrders}
                placeholderIcon={primary?.icon ?? "store"}
                onAdd={() => onAdd(p)}
                onQuantity={(q) => setQuantity(p.id, q)}
              />
            )}
          />
        )}
        <p className="mt-10 text-center text-xs text-ink/45">{t("courierNote")}</p>
      </div>

      <CartBar />

      <Dialog open={!!pending} onClose={() => setPending(null)} title={t("switchTitle")} description={t("switchBody", { current: cart?.establishmentName ?? "", next: data.name })} closeLabel={t("close")}>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            size="lg"
            block
            onClick={() => {
              if (pending) {
                replace(null);
                add(data, lineFor(pending));
              }
              setPending(null);
            }}
          >
            {t("switchConfirm")}
          </Button>
          <Button variant="ghost" block onClick={() => setPending(null)}>
            {t("switchKeep")}
          </Button>
        </div>
      </Dialog>
    </main>
  );
}

/** Aviso de puerta: "Abierto" en verde o "Cerrado" en gris. */
function DoorSign({ open }: { open: boolean }) {
  const t = useTranslations("store");
  return (
    <div className="door-sign shrink-0 self-start text-white sm:self-auto [&::before]:invert">
      <div
        className={`rotate-[-3deg] rounded-xl border-2 px-4 py-2 text-center shadow-lg ${open ? "border-emerald-300 bg-leaf text-white" : "border-white/30 bg-white/10 text-white/80"}`}
      >
        <p className="font-display text-lg font-extrabold uppercase leading-none tracking-wider">{open ? t("open") : t("closed")}</p>
        <p className="mt-1 text-[11px] font-semibold opacity-80">{open ? t("openHint") : t("closedHint")}</p>
      </div>
    </div>
  );
}

interface MenuSectionsProps {
  sections: EstablishmentDetail["sections"];
  allSections: EstablishmentDetail["sections"];
  query: string;
  onQuery: (q: string) => void;
  render: (product: MenuProduct) => ReactNode;
}

/** Barra de secciones pegada arriba (la activa se resalta al desplazarse) y buscador dentro del menú. */
function MenuSections({ sections, allSections, query, onQuery, render }: MenuSectionsProps) {
  const t = useTranslations("store");
  const [active, setActive] = useState<string | null>(allSections[0]?.id ?? null);
  const refs = useRef(new Map<string, HTMLElement>());
  const chips = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace("section-", ""));
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    refs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    chips.current?.querySelector<HTMLElement>(`[data-section="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  const jump = (sectionId: string) => {
    const el = refs.current.get(sectionId);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: "smooth" });
  };

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 mt-6 bg-surface/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <label className="relative shrink-0">
            <span className="sr-only">{t("search")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/40" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-10 w-36 rounded-full border border-ink/10 bg-white pl-9 pr-3 text-sm outline-none transition focus:w-52 focus:ring-4 focus:ring-brand/25 sm:w-44"
            />
          </label>
          <div ref={chips} className="no-scrollbar flex gap-1.5 overflow-x-auto" role="tablist" aria-label={t("sections")}>
            {sections.map((s) => (
              <button
                key={s.id}
                data-section={s.id}
                role="tab"
                aria-selected={active === s.id}
                onClick={() => jump(s.id)}
                className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold transition ${active === s.id ? "bg-ink text-brand" : "bg-white text-ink/70 hover:text-ink"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="py-16 text-center text-ink/55">{t("noMatches", { query })}</p>
      ) : (
        sections.map((s) => (
          <section
            key={s.id}
            id={`section-${s.id}`}
            ref={(el) => {
              if (el) refs.current.set(s.id, el);
              else refs.current.delete(s.id);
            }}
            className="mt-8 scroll-mt-28"
            aria-labelledby={`section-title-${s.id}`}
          >
            <h2 id={`section-title-${s.id}`} className="flex items-center gap-3 font-display text-2xl font-extrabold tracking-tight">
              {s.name}
              <span className="h-px flex-1 border-t-2 border-dashed border-ink/15" aria-hidden />
              <span className="text-sm font-semibold text-ink/40">{s.products.length}</span>
            </h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2">{s.products.map(render)}</div>
          </section>
        ))
      )}
    </>
  );
}

function StoreSkeleton() {
  return (
    <main className="min-h-dvh bg-surface" aria-busy>
      <div className="awning h-14 opacity-60 sm:h-16" aria-hidden />
      <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
        <div className="h-44 animate-pulse rounded-[30px] bg-ink/10" />
        <div className="mt-8 h-8 w-48 animate-pulse rounded-xl bg-ink/10" />
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-[26px] bg-white" />
          ))}
        </div>
      </div>
    </main>
  );
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
