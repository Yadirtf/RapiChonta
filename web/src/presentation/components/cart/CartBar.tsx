"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ShoppingBasket } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cartCount, cartSubtotalCents } from "@/core/domain/entities/cart";
import { useCart } from "../../cart/CartProvider";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import { CartDrawer } from "./CartDrawer";

/** Barra flotante con el borde de un recibo: cuántos productos van y cuánto suman. */
/** `className` define el borde izquierdo (por ejemplo, para no tapar el menú lateral). */
export function CartBar({ className = "" }: { className?: string }) {
  const t = useTranslations("cart");
  const money = useCatalogFormat();
  const { cart } = useCart();
  const [open, setOpen] = useState(false);
  const count = cartCount(cart);

  return (
    <>
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className={`pointer-events-none fixed bottom-0 right-0 z-30 flex justify-center px-4 pb-4 ${className || "left-0"}`}
          >
            <button
              onClick={() => setOpen(true)}
              className="receipt-edge pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-b-3xl bg-ink px-4 pb-3.5 pt-3 text-left text-white shadow-2xl [--receipt:var(--color-ink)] active:scale-[0.99]"
            >
              <span className="relative grid size-11 place-items-center rounded-2xl bg-brand text-ink">
                <ShoppingBasket className="size-5" aria-hidden />
                <motion.span
                  key={count}
                  initial={{ scale: 1.6 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-white px-1 text-[11px] font-extrabold text-ink"
                >
                  {count}
                </motion.span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{t("view")}</span>
                <span className="block truncate text-xs text-white/60">{cart?.establishmentName}</span>
              </span>
              <span className="font-display text-lg font-extrabold tabular-nums text-brand">{money.cents(cartSubtotalCents(cart))}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
