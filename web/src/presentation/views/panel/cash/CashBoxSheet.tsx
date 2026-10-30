"use client";

import { AlertTriangle, Loader2, PenLine, Receipt, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { createElement, useState } from "react";
import { fullName } from "@/core/domain/entities/account";
import { LEDGER_ORDER, signedCents, type CashBoxDetail, type CashMethod, type CashMovement } from "@/core/domain/entities/cash";
import { container } from "@/infrastructure/di/container";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { usePolling } from "../../../hooks/usePolling";
import { useOrderTime } from "../../orders/useOrderDate";
import { AdjustDialog, CloseBoxDialog, type AdjustTarget } from "./CashDialogs";
import { MOVEMENT_ICON, REVERSAL_ICON } from "./cashVisuals";
import { useCashFormat } from "./useCashFormat";

/**
 * La libreta de la caja: la cuenta del día como un recibo (base, compras, cobros, tarifas, comisiones, lo entregado y
 * los ajustes, hasta lo que debe entregar), lo cobrado por pedido, lo entregado sin cobro y el libro línea por línea.
 */
export function CashBoxSheet({
  boxId,
  methods,
  canAdjust,
  onClose,
  onDone,
  onFailed,
}: {
  boxId: string | null;
  methods: CashMethod[];
  canAdjust: boolean;
  onClose: () => void;
  onDone: (text: string) => void;
  onFailed: (error: unknown) => void;
}) {
  const t = useTranslations("cash");
  const errorMessage = useErrorMessage();
  const format = useCashFormat();
  const detail = usePolling(() => (boxId ? container.cash.detail(boxId) : Promise.resolve(null)), [boxId], 15_000);
  const box = detail.data && detail.data.id === boxId ? detail.data : null;
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);
  const [closing, setClosing] = useState(false);

  const after = (text: string) => {
    void detail.refresh();
    onDone(text);
  };

  return (
    <Dialog
      open={!!boxId}
      onClose={onClose}
      side
      size="lg"
      closeLabel={t("close")}
      title={box ? fullName(box.courier) : t("ledgerTitle")}
      description={box ? `${format.day(box.businessDate)} · ${t(`mode.${box.fundingMode ?? "NONE"}`)}` : undefined}
    >
      {!box ? (
        detail.error ? (
          <Alert>{errorMessage(detail.error)}</Alert>
        ) : (
          <div className="grid min-h-60 place-items-center" aria-busy>
            <Loader2 className="size-6 animate-spin text-ink/40" aria-hidden />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-6">
          <Account box={box} />
          <div className="-mt-2 flex flex-wrap gap-2">
            {canAdjust && (
              <Button variant="outline" onClick={() => setAdjusting({ kind: "free" })}>
                <PenLine className="size-4" aria-hidden /> {t("adjust")}
              </Button>
            )}
            {box.state === "OPEN" && (
              <Button variant="dark" className="flex-1" onClick={() => setClosing(true)}>
                <Scale className="size-4 text-brand" aria-hidden /> {t("closeBox")}
              </Button>
            )}
          </div>
          {box.uncollected.length > 0 && <Uncollected box={box} />}
          {box.closure && (
            <p className="flex items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white">
              <Scale className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>
                <b>{t("closedBy", { name: fullName(box.closure.closedBy) })}</b>
                {box.closure.notes && <span className="mt-0.5 block text-white/75">“{box.closure.notes}”</span>}
              </span>
            </p>
          )}
          <Ledger box={box} canAdjust={canAdjust} onReverse={(m) => setAdjusting({ kind: "reverse", movement: m })} />
          {box.orders.length > 0 && <Orders box={box} />}

        </div>
      )}

      {box && (
        <>
          <AdjustDialog
            box={box}
            target={adjusting}
            onClose={() => setAdjusting(null)}
            onDone={(text) => {
              setAdjusting(null);
              after(text);
            }}
            onFailed={onFailed}
          />
          <CloseBoxDialog
            box={box}
            open={closing}
            methods={methods}
            onClose={() => setClosing(false)}
            onDone={(text) => {
              setClosing(false);
              after(text);
            }}
          />
        </>
      )}
    </Dialog>
  );
}

/** La cuenta: cada tipo con su signo, las tarifas que se queda el domiciliario y las comisiones, hasta el total. */
function Account({ box }: { box: CashBoxDetail }) {
  const t = useTranslations("cash");
  const format = useCashFormat();
  const totals = LEDGER_ORDER.map((type) => box.totals.find((x) => x.type === type)).filter((x) => !!x);
  const due = signedCents(box.balance.amountDue);
  const closed = box.state === "CLOSED";
  const line = (key: string, label: string, value: string, hint?: string) => (
    <div key={key} className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-ink/65">
        {label}
        {hint && <span className="ml-1.5 text-xs text-ink/40">{hint}</span>}
      </dt>
      <dd className={`font-semibold tabular-nums ${signedCents(value) < 0 ? "text-chonta-strong" : ""}`}>{format.signed(value)}</dd>
    </div>
  );

  return (
    <section className="receipt-edge mt-2 rounded-b-[24px] bg-white px-5 pb-5 pt-4 shadow-[0_14px_30px_-22px_rgb(20_18_31/0.45)] ring-1 ring-ink/5" aria-labelledby="cash-account">
      <h3 id="cash-account" className="flex items-center gap-2 border-b-2 border-dashed border-ink/15 pb-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-leaf">
        <Receipt className="size-4" aria-hidden /> {t("accountTitle")}
      </h3>
      <dl className="flex flex-col divide-y divide-dashed divide-ink/10 pt-1 text-sm">
        {totals.map((x) => line(x.type, t(`types.${x.type}.label`), x.signed, x.count > 1 ? t("times", { count: x.count }) : undefined))}
        {signedCents(box.balance.courierFees) !== 0 && line("fees", t("feesLine"), `-${box.balance.courierFees}`, t("ordersCount", { count: box.balance.settledOrders }))}
        {signedCents(box.balance.commissions) !== 0 && line("commissions", t("commissionsLine"), box.balance.commissions)}
      </dl>
      <div className="mt-1 flex items-end justify-between gap-3 border-t-2 border-dashed border-ink/15 pt-3">
        <span className="font-bold">{closed ? t("leftAfterClose") : due < 0 ? t("owedToCourier") : t("mustDeliver")}</span>
        <span className={`font-display text-3xl font-extrabold tabular-nums ${closed && due !== 0 ? "text-chonta-strong" : ""}`}>{format.cents(due)}</span>
      </div>
      <p className="mt-2 text-xs text-ink/50">{t(box.fundingMode === "CASH_BOX" ? "formulaBase" : "formulaOwn")}</p>
    </section>
  );
}

function Uncollected({ box }: { box: CashBoxDetail }) {
  const t = useTranslations("cash");
  const format = useCashFormat();
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-chonta-soft px-4 py-3 text-sm text-chonta-strong" role="status">
      <p className="flex items-center gap-2 font-bold">
        <AlertTriangle className="size-4" aria-hidden /> {t("uncollectedTitle", { count: box.uncollected.length })}
      </p>
      <ul className="flex flex-col gap-1">
        {box.uncollected.map((o) => (
          <li key={o.code} className="flex justify-between gap-3">
            <span>
              <b className="font-mono">{o.code}</b> · {o.storeName}
            </span>
            <span className="tabular-nums">{format.amount(o.customerTotal)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-chonta-strong/80">{t("uncollectedBody")}</p>
    </div>
  );
}

/** El libro: una fila por movimiento, con quién lo hizo; las anuladas se ven tachadas y su ajuste debajo. */
function Ledger({ box, canAdjust, onReverse }: { box: CashBoxDetail; canAdjust: boolean; onReverse: (m: CashMovement) => void }) {
  const t = useTranslations("cash");
  const tp = useTranslations("payment");
  const format = useCashFormat();
  const time = useOrderTime();
  return (
    <section aria-labelledby="cash-ledger" className="flex flex-col gap-2">
      <h3 id="cash-ledger" className="font-display text-base font-extrabold">
        {t("ledgerTitle")} <span className="tabular-nums text-ink/40">· {box.movements.length}</span>
      </h3>
      {box.movements.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-ink/10 px-4 py-6 text-center text-sm text-ink/45">{t("ledgerEmpty")}</p>
      ) : (
        <ol className="cash-ledger flex flex-col">
          {box.movements.map((m) => {
            const negative = m.direction < 0;
            const reversed = !!m.reversedById;
            return (
              <li key={m.id} className="flex items-start gap-3 py-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${negative ? "bg-chonta-soft text-chonta-strong" : "bg-leaf/10 text-leaf"}`} aria-hidden>
                  {createElement(m.reversesMovementId ? REVERSAL_ICON : MOVEMENT_ICON[m.type], { className: "size-4" })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-bold ${reversed ? "text-ink/40 line-through" : ""}`}>
                    {m.reversesMovementId ? t("reversalOf") : t(`types.${m.type}.label`)}
                    {m.orderCode && <span className="ml-1.5 font-mono text-xs font-semibold text-ink/50">{m.orderCode}</span>}
                  </span>
                  <span className="block text-xs text-ink/50">
                    {time(m.createdAt)}
                    {m.paymentMethod && ` · ${tp.has(m.paymentMethod) ? tp(m.paymentMethod) : m.paymentMethod}`}
                    {m.createdBy && ` · ${fullName(m.createdBy)}`}
                  </span>
                  {m.note && <span className="mt-1 block text-xs italic text-ink/65">“{m.note}”</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`font-display font-extrabold tabular-nums ${reversed ? "text-ink/35 line-through" : negative ? "text-chonta-strong" : "text-leaf"}`}>{format.signed(m.signed)}</span>
                  {canAdjust && m.reversible && (
                    <button type="button" onClick={() => onReverse(m)} className="rounded-full px-2 py-0.5 text-[11px] font-bold text-ink/55 hover:bg-ink/5 hover:text-ink">
                      {t("reverse")}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Orders({ box }: { box: CashBoxDetail }) {
  const t = useTranslations("cash");
  const format = useCashFormat();
  return (
    <section aria-labelledby="cash-orders" className="flex flex-col gap-2">
      <h3 id="cash-orders" className="font-display text-base font-extrabold">
        {t("ordersTitle")}
      </h3>
      <ul className="flex flex-col gap-2">
        {box.orders.map((o) => (
          <li key={o.code} className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-2xl bg-cream/60 px-4 py-3 text-sm ${o.counted ? "" : "opacity-60"}`}>
            <span className="font-bold">
              <span className="font-mono">{o.code}</span> · {o.storeName}
            </span>
            <span className="text-right font-semibold tabular-nums">{format.amount(o.collected)}</span>
            <span className="text-xs text-ink/55">
              {o.counted
                ? t("orderFeeLine", {
                    fee: format.amount(o.deliveryFee),
                    commission: format.amount(o.commission),
                  })
                : t("orderNotCounted")}
            </span>
            {signedCents(o.collected) !== signedCents(o.customerTotal) && (
              <span className="text-right text-xs font-bold text-chonta-strong">{t("orderExpected", { amount: format.amount(o.customerTotal) })}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
