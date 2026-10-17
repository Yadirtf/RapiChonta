"use client";

import { ShoppingBasket, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { cartCount, cartSubtotalCents } from "@/core/domain/entities/cart";
import { useCart } from "../../cart/CartProvider";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { QuantityStepper } from "./QuantityStepper";

/**
 * La canasta como un recibo de tienda: líneas, subtotal y el aviso de que el domicilio se suma al
 * confirmar. La confirmación del pedido llega con la épica de pedidos (E04).
 */
export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("cart");
  const money = useCatalogFormat();
  const { cart, setQuantity, clear } = useCart();
  const count = cartCount(cart);

  return (
    <Dialog open={open} onClose={onClose} title={t("title")} side closeLabel={t("close")}
      description={cart ? (
        <Link href={`/local/${cart.establishmentId}`} onClick={onClose} className="inline-flex items-center gap-1.5 font-semibold text-ink hover:underline">
          <Store className="size-4" aria-hidden /> {cart.establishmentName}
        </Link>
      ) : undefined}
    >
      {!cart ? (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="grid size-16 place-items-center rounded-3xl bg-brand/20 text-brand-strong">
            <ShoppingBasket className="size-8" aria-hidden />
          </span>
          <p className="mt-4 font-display text-lg font-extrabold">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-xs text-sm text-ink/55">{t("emptyBody")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <ul className="flex flex-col divide-y divide-dashed divide-ink/15">
            {cart.lines.map((line) => (
              <li key={line.productId} className="flex items-center gap-3 py-3">
                <div className="size-14 shrink-0 overflow-hidden rounded-2xl bg-surface">
                  {line.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="grid size-full place-items-center text-ink/25">
                      <ShoppingBasket className="size-6" aria-hidden />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{line.name}</p>
                  <p className="text-sm text-ink/55">{money.price(line.price)}</p>
                </div>
                <QuantityStepper quantity={line.quantity} name={line.name} onChange={(q) => setQuantity(line.productId, q)} />
              </li>
            ))}
          </ul>

          <div className="rounded-3xl bg-cream p-4 [--tag-hole:var(--color-cream)]">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-ink/70">{t("subtotal", { count })}</span>
              <span className="font-display text-2xl font-extrabold tabular-nums">{money.cents(cartSubtotalCents(cart))}</span>
            </div>
            <p className="mt-1 text-xs text-ink/55">{t("feeLater")}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Button size="lg" block disabled>
              {t("checkout")}
            </Button>
            <p className="text-center text-xs text-ink/50">{t("checkoutSoon")}</p>
            <Button variant="ghost" block onClick={clear}>
              {t("clear")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
