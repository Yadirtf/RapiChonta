"use client";

import { Clock3, MessageSquareText, Sprout, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { CART_LIMITS, cartCount, cartSubtotalCents, type Cart, type CartLine } from "@/core/domain/entities/cart";
import { toCents } from "@/core/domain/entities/money";
import type { OrderQuote } from "@/core/domain/entities/order";
import { ApproxPrice } from "../../components/business/ApproxPrice";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import type { ZoneState } from "./DeliveryStep";

/**
 * La comanda: lo que el domiciliario va a comprar, con una nota por producto, y el total que se paga al
 * recibir. Los valores salen de la cotización de la API (precio vigente y tarifa de la zona).
 */
export function CheckoutReceipt({ cart, quote, zone, onNotes, children }: {
  cart: Cart;
  quote: OrderQuote | null;
  zone: ZoneState;
  onNotes: (productId: string, notes: string) => void;
  children: ReactNode;
}) {
  const t = useTranslations("checkout");
  const money = useCatalogFormat();
  const itemsCents = quote ? toCents(quote.itemsTotal) : cartSubtotalCents(cart);
  const feeCents = quote && zone.kind === "zone" ? toCents(quote.deliveryFee) : null;
  const totalCents = feeCents === null ? null : itemsCents + feeCents;

  return (
    <div className="receipt-edge mt-2.5 rounded-b-[28px] bg-white px-5 pb-5 pt-4 shadow-[0_18px_40px_-24px_rgb(20_18_31/0.45)] sm:px-6">
      <header className="flex items-center justify-between gap-3 border-b-2 border-dashed border-ink/15 pb-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-chonta">{t("receipt")}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate font-display text-lg font-extrabold">
            <Store className="size-4 shrink-0" aria-hidden /> {cart.establishmentName}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink/70">{t("items", { count: cartCount(cart) })}</span>
      </header>

      <ul className="flex flex-col divide-y divide-dashed divide-ink/10">
        {cart.lines.map((line) => (
          <ReceiptLine key={line.productId} line={line} onNotes={(notes) => onNotes(line.productId, notes)} />
        ))}
      </ul>

      <dl className="mt-1 flex flex-col gap-1.5 border-t-2 border-dashed border-ink/15 pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink/60">{t("products")}</dt>
          <dd className="font-semibold tabular-nums">{money.cents(itemsCents)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="min-w-0 truncate text-ink/60">{zone.kind === "zone" ? `${t("delivery")} · ${zone.name}` : t("delivery")}</dt>
          <dd className="font-semibold tabular-nums">{feeCents === null ? <span className="text-ink/40">{t("deliveryPending")}</span> : money.cents(feeCents)}</dd>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <dt className="font-bold">{t("total")}</dt>
          <dd className="flex flex-col items-end">
            <span className="font-display text-3xl font-extrabold tabular-nums tracking-tight">{money.cents(totalCents ?? itemsCents)}</span>
            {totalCents !== null && <ApproxPrice cents={totalCents} />}
          </dd>
        </div>
      </dl>

      {quote && quote.prepMinutes > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-ink/55">
          <Clock3 className="size-3.5" aria-hidden /> {t("prep", { minutes: quote.prepMinutes })}
        </p>
      )}
      {quote?.newCustomerLimit && <FirstOrderMeter limit={quote.newCustomerLimit} itemsCents={itemsCents} />}

      <div className="mt-4 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function ReceiptLine({ line, onNotes }: { line: CartLine; onNotes: (notes: string) => void }) {
  const t = useTranslations("checkout");
  const money = useCatalogFormat();
  const [editing, setEditing] = useState(false);

  return (
    <li className="py-2.5">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="w-7 shrink-0 font-display font-extrabold tabular-nums text-chonta">{line.quantity}×</span>
        <span className="min-w-0 flex-1 font-semibold">{line.name}</span>
        <span className="shrink-0 font-semibold tabular-nums">{money.cents(toCents(line.price) * line.quantity)}</span>
      </div>
      <div className="pl-9">
        {editing ? (
          <input
            autoFocus
            aria-label={`${t("lineNote")} · ${line.name}`}
            value={line.notes ?? ""}
            maxLength={CART_LIMITS.notes}
            placeholder={t("lineNotePlaceholder")}
            onChange={(e) => onNotes(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
            className="mt-1.5 h-9 w-full rounded-xl border border-ink/12 bg-cream/60 px-3 text-sm outline-none focus:border-ink/40 focus:ring-4 focus:ring-brand/25"
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="mt-0.5 inline-flex max-w-full items-center gap-1 text-left text-xs font-semibold text-ink/50 hover:text-chonta-strong">
            <MessageSquareText className="size-3.5 shrink-0" aria-hidden />
            <span className={line.notes ? "truncate italic text-ink/70" : ""}>{line.notes || t("addNote")}</span>
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Tope del primer pedido (RF-22): un brote que crece hasta el límite. Cuenta lo de este pedido más lo que
 * ya está en camino, porque el tope es por cliente nuevo y no por pedido.
 */
function FirstOrderMeter({ limit, itemsCents }: { limit: NonNullable<OrderQuote["newCustomerLimit"]>; itemsCents: number }) {
  const t = useTranslations("checkout");
  const money = useCatalogFormat();
  const limitCents = toCents(limit.limit);
  const availableCents = toCents(limit.available);
  const used = Math.min(1, (limitCents - availableCents + itemsCents) / Math.max(1, limitCents));
  const over = itemsCents - availableCents;

  return (
    <div className={`mt-4 rounded-2xl p-3.5 ${limit.exceeded ? "bg-chonta-soft" : "bg-leaf/10"}`} role="status">
      <p className={`flex items-center gap-1.5 text-sm font-extrabold ${limit.exceeded ? "text-chonta-strong" : "text-leaf"}`}>
        <Sprout className="size-4" aria-hidden /> {t("firstOrderTitle")}
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" aria-hidden>
        <div className={`h-full rounded-full transition-[width] ${limit.exceeded ? "bg-chonta" : "bg-leaf"}`} style={{ width: `${used * 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink/70">
        {limit.exceeded ? t("firstOrderExceeded", { over: money.cents(over) }) : t("firstOrderBody", { limit: money.price(limit.limit), available: money.price(limit.available) })}
      </p>
    </div>
  );
}
