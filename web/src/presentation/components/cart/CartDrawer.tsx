"use client";

import { ArrowRight, Clock3, ShoppingBasket, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { cartCount, cartSubtotalCents } from "@/core/domain/entities/cart";
import { toCents } from "@/core/domain/entities/money";
import { useBusiness, useOpeningText } from "../../business/BusinessProvider";
import { useCart } from "../../cart/CartProvider";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import { ApproxPrice } from "../business/ApproxPrice";
import { OpeningSign } from "../business/OpeningSign";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { DeliveryEstimate } from "./DeliveryEstimate";
import { QuantityStepper } from "./QuantityStepper";

/**
 * La canasta como un recibo de tienda: líneas, subtotal, domicilio estimado a la ubicación actual (E03) y
 * el botón de pedir (lleva a /pedido), que fuera de horario muestra la próxima apertura.
 */
export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("cart");
  const money = useCatalogFormat();
  const { cart, setQuantity, clear } = useCart();
  const { status } = useBusiness();
  const opening = useOpeningText()(status);
  const closed = opening?.tone === "closed";
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
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink/55">
                    {money.price(line.price)}
                    <ApproxPrice cents={toCents(line.price)} />
                  </p>
                </div>
                <QuantityStepper quantity={line.quantity} name={line.name} onChange={(q) => setQuantity(line.productId, q)} />
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3 rounded-3xl bg-cream p-4 [--tag-hole:var(--color-cream)]">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-ink/70">{t("subtotal", { count })}</span>
              <span className="flex flex-col items-end">
                <span className="font-display text-xl font-extrabold tabular-nums">{money.cents(cartSubtotalCents(cart))}</span>
                <ApproxPrice cents={cartSubtotalCents(cart)} />
              </span>
            </div>
            <DeliveryEstimate establishmentId={cart.establishmentId} subtotalCents={cartSubtotalCents(cart)} />
            <p className="text-xs text-ink/55">{t("payOnDelivery")}</p>
          </div>

          <div className="flex flex-col gap-2">
            <OpeningSign className="justify-center" />
            {closed ? (
              // Fuera de horario el botón de pedir dice cuándo abrimos (RF-15); el menú se sigue viendo.
              <Button size="lg" block disabled variant="dark" className="!opacity-100">
                <Clock3 className="size-5 text-brand" aria-hidden /> {opening?.detail}
              </Button>
            ) : (
              <Link
                href="/pedido"
                onClick={onClose}
                className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-base font-bold text-ink outline-none transition hover:bg-[#ffcf55] focus-visible:ring-4 focus-visible:ring-brand/50 active:scale-[0.98]"
              >
                {t("checkout")} <ArrowRight className="size-5" aria-hidden />
              </Link>
            )}
            <Button variant="ghost" block onClick={clear}>
              {t("clear")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
