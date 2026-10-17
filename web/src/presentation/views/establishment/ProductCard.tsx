"use client";

import { motion } from "framer-motion";
import { CookingPot, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MenuProduct } from "@/core/domain/entities/establishment";
import { QuantityStepper } from "../../components/cart/QuantityStepper";
import { CategoryIcon } from "../../components/catalog/CategoryIcon";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";

interface Props {
  product: MenuProduct;
  quantity: number;
  canOrder: boolean;
  placeholderIcon: string;
  onAdd: () => void;
  onQuantity: (quantity: number) => void;
}

/** Producto con su etiqueta de precio colgada y el tiempo de preparación; agotado = sello encima. */
export function ProductCard({ product, quantity, canOrder, placeholderIcon, onAdd, onQuantity }: Props) {
  const t = useTranslations("store");
  const format = useCatalogFormat();
  const soldOut = !product.orderable;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      className={`relative flex gap-4 rounded-[26px] bg-white p-4 pt-5 shadow-[0_1px_0_rgb(20_18_31/0.06),0_8px_24px_-12px_rgb(20_18_31/0.18)] ${quantity > 0 ? "ring-2 ring-brand" : ""}`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`price-tag -ml-4 self-start text-[15px] ${soldOut ? "grayscale" : ""}`}>{format.price(product.price)}</span>
        <h3 className="mt-2.5 font-display text-[17px] font-extrabold leading-snug text-ink">{product.name}</h3>
        {product.description && <p className="mt-1 line-clamp-2 text-sm text-ink/60">{product.description}</p>}
        <div className="mt-auto flex items-center gap-2 pt-3">
          {product.prepMinutes > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink/70" title={t("prepTitle")}>
              <CookingPot className="size-3.5" aria-hidden />
              {t("prepMinutes", { minutes: product.prepMinutes })}
            </span>
          )}
          {soldOut && <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">{t("soldOut")}</span>}
        </div>
      </div>

      <div className="relative w-28 shrink-0 self-stretch sm:w-32">
        <div className={`aspect-square w-full overflow-hidden rounded-2xl bg-cream ${soldOut ? "grayscale" : ""}`}>
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-brand-strong/40">
              <CategoryIcon name={placeholderIcon} className="size-10" strokeWidth={1.5} />
            </span>
          )}
        </div>
        {soldOut && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-md border-2 border-red-600 bg-white/85 px-2 py-0.5 text-xs font-extrabold uppercase tracking-widest text-red-600">
            {t("soldOut")}
          </span>
        )}
        {canOrder && !soldOut && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
            {quantity > 0 ? (
              <QuantityStepper quantity={quantity} name={product.name} onChange={onQuantity} tone="brand" />
            ) : (
              <button
                onClick={onAdd}
                aria-label={t("add", { name: product.name })}
                className="grid size-10 place-items-center rounded-full bg-ink text-brand shadow-lg ring-4 ring-white transition hover:scale-105 active:scale-90"
              >
                <Plus className="size-5" strokeWidth={3} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
}
