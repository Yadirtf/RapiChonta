"use client";

import { ArrowDownLeft, ArrowUpRight, Scale, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { createElement, useState } from "react";
import { fullName } from "@/core/domain/entities/account";
import { BASE_PRESETS, closingGap, gapTone, signedCents, type AdjustmentDirection, type CashBoxDetail, type CashMethod, type CashMovement, type CourierBoxRow } from "@/core/domain/entities/cash";
import { fromCents, parsePriceInput, toCents } from "@/core/domain/entities/money";
import type { PaymentMethodCode } from "@/core/domain/entities/order";
import { container } from "@/infrastructure/di/container";
import { paymentIcon } from "../../../components/orders/orderVisuals";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { inputClass, TextField } from "../../../components/ui/Field";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { GAP_STAMP } from "./cashVisuals";
import { useCashFormat } from "./useCashFormat";

const NOTE_MIN = 4;
const noteOk = (note: string) => note.replace(/\s+/g, " ").trim().length >= NOTE_MIN;

/** Medios con su ícono, como chips: un toque y queda elegido. */
function MethodChips({ methods, value, onChange, label }: { methods: CashMethod[]; value: string; onChange: (code: string) => void; label: string }) {
  const tp = useTranslations("payment");
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {methods.map((m) => (
        <button
          key={m.code}
          type="button"
          role="radio"
          aria-checked={value === m.code}
          onClick={() => onChange(m.code)}
          className={`inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-bold transition ${value === m.code ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/12 hover:ring-ink/30"}`}
        >
          {createElement(paymentIcon(m.code as PaymentMethodCode), {
            className: `size-4 ${value === m.code ? "text-brand" : "text-leaf"}`,
            "aria-hidden": true,
          })}
          {tp.has(m.code) ? tp(m.code) : m.code}
        </button>
      ))}
    </div>
  );
}

function NoteField({ value, onChange, label, hint, required }: { value: string; onChange: (v: string) => void; label: string; hint?: string; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink/80">
        {label}
        {required && <span className="text-chonta-strong"> *</span>}
      </span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} maxLength={300} className={`${inputClass} h-auto py-3`} />
      {hint && <span className="text-xs text-ink/50">{hint}</span>}
    </label>
  );
}

/**
 * H11.1: entregar la base del día. Los valores de siempre a un toque, el medio (efectivo o a la cuenta del
 * domiciliario) y una nota opcional. Queda firmada por quien la entrega.
 */
export function OpenBaseDialog({ row, methods, onClose, onDone }: { row: CourierBoxRow | null; methods: CashMethod[]; onClose: () => void; onDone: (text: string) => void }) {
  const t = useTranslations("cash");
  const name = row ? row.courier.givenNames.split(" ")[0] : "";
  return (
    <Dialog open={!!row} onClose={onClose} title={t("baseTitle", { name })} description={t("baseBody")} closeLabel={t("close")}>
      {row && <OpenBaseForm key={row.courier.userId} row={row} methods={methods} onDone={onDone} />}
    </Dialog>
  );
}

function OpenBaseForm({ row, methods, onDone }: { row: CourierBoxRow; methods: CashMethod[]; onDone: (text: string) => void }) {
  const t = useTranslations("cash");
  const errorMessage = useErrorMessage();
  const format = useCashFormat();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(() => methods[0]?.code ?? "CASH");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parsePriceInput(amount);
  const name = row.courier.givenNames.split(" ")[0];

  const submit = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      await container.cash.open({
        courierUserId: row.courier.userId,
        amount: parsed,
        paymentMethod: method,
        note: note.trim() || undefined,
      });
      onDone(t("baseDone", { name, amount: format.amount(parsed) }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {BASE_PRESETS.map((pesos) => {
          const value = fromCents(pesos * 100);
          return (
            <button
              key={pesos}
              type="button"
              onClick={() => setAmount(String(pesos))}
              aria-pressed={parsed === value}
              className={`h-11 rounded-2xl px-4 font-display text-sm font-extrabold tabular-nums transition ${parsed === value ? "bg-brand text-ink" : "bg-cream text-ink/75 hover:bg-brand/50"}`}
            >
              {format.amount(value)}
            </button>
          );
        })}
      </div>
      <TextField label={t("amountLabel")} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100.000" error={amount && !parsed ? t("amountInvalid") : null} />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-ink/80">{t("methodLabel")}</p>
        <MethodChips methods={methods} value={method} onChange={setMethod} label={t("methodLabel")} />
        {methods.find((m) => m.code === method)?.isAccountBased && <p className="text-xs text-ink/50">{t("baseAccountHint")}</p>}
      </div>
      <NoteField value={note} onChange={setNote} label={t("noteOptional")} />
      {error && <Alert>{error}</Alert>}
      <Button variant="dark" block onClick={submit} loading={busy} disabled={!parsed || signedCents(parsed) <= 0}>
        <Wallet className="size-4 text-brand" aria-hidden />
        {parsed ? t("baseConfirm", { amount: format.amount(parsed) }) : t("giveBase")}
      </Button>
    </div>
  );
}

export type AdjustTarget = { kind: "free" } | { kind: "reverse"; movement: CashMovement };

/**
 * Un ajuste firmado (RF-71). Para anular un movimiento basta con decir por qué: el sentido y el monto salen de él. Uno
 * libre dice a favor de quién va y cuánto.
 */
export function AdjustDialog({
  box,
  target,
  onClose,
  onDone,
  onFailed,
}: {
  box: CashBoxDetail;
  target: AdjustTarget | null;
  onClose: () => void;
  onDone: (text: string) => void;
  onFailed: (error: unknown) => void;
}) {
  const t = useTranslations("cash");
  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={target?.kind === "reverse" ? t("reverseTitle") : t("adjustTitle")}
      description={t("adjustBody", { name: fullName(box.courier) })}
      closeLabel={t("close")}
    >
      {target && <AdjustForm key={target.kind === "reverse" ? target.movement.id : "free"} box={box} target={target} onDone={onDone} onFailed={onFailed} />}
    </Dialog>
  );
}

function AdjustForm({ box, target, onDone, onFailed }: { box: CashBoxDetail; target: AdjustTarget; onDone: (text: string) => void; onFailed: (error: unknown) => void }) {
  const t = useTranslations("cash");
  const errorMessage = useErrorMessage();
  const format = useCashFormat();
  const [direction, setDirection] = useState<AdjustmentDirection>("IN");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reversing = target.kind === "reverse" ? target.movement : null;
  const parsed = reversing ? reversing.amount : parsePriceInput(amount);
  const ready = !!parsed && noteOk(note);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await container.cash.adjust(box.id, reversing ? { note, reversesMovementId: reversing.id } : { note, direction, amount: parsed! });
      onDone(t("adjustDone"));
    } catch (e) {
      setError(errorMessage(e));
      onFailed(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {reversing ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
          <span>
            <span className="block font-bold">{t(`types.${reversing.type}.label`)}</span>
            <span className="text-xs text-ink/55">{t("reverseHint")}</span>
          </span>
          <span className="font-display text-xl font-extrabold tabular-nums line-through decoration-chonta decoration-2">{format.signed(reversing.signed)}</span>
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label={t("directionLabel")} className="grid grid-cols-2 gap-2">
            {(["IN", "OUT"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={direction === d}
                onClick={() => setDirection(d)}
                className={`flex flex-col items-start gap-1 rounded-2xl p-3 text-left transition ${direction === d ? "bg-ink text-white" : "bg-white ring-1 ring-ink/12 hover:ring-ink/30"}`}
              >
                {d === "IN" ? (
                  <ArrowUpRight className={`size-5 ${direction === d ? "text-brand" : "text-leaf"}`} aria-hidden />
                ) : (
                  <ArrowDownLeft className={`size-5 ${direction === d ? "text-brand" : "text-chonta"}`} aria-hidden />
                )}
                <span className="text-sm font-bold">{t(`direction.${d}.label`)}</span>
                <span className={`text-xs ${direction === d ? "text-white/70" : "text-ink/55"}`}>{t(`direction.${d}.hint`)}</span>
              </button>
            ))}
          </div>
          <TextField label={t("amountLabel")} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={amount && !parsePriceInput(amount) ? t("amountInvalid") : null} />
        </>
      )}
      <NoteField value={note} onChange={setNote} label={t("noteRequired")} hint={t("noteSigned")} required />
      {box.state === "CLOSED" && <Alert tone="info">{t("adjustClosedHint")}</Alert>}
      {error && <Alert>{error}</Alert>}
      <Button variant="dark" block onClick={submit} loading={busy} disabled={!ready}>
        {t("adjustConfirm")}
      </Button>
    </div>
  );
}

/**
 * H11.3 · El arqueo. Lo que debe entregar arriba; lo que trae, por medio; y el sello que cambia mientras se escribe:
 * cuadra, faltan o sobran. Con diferencia, la nota es obligatoria. Con un pedido en curso no se cierra.
 */
export function CloseBoxDialog({ box, open, methods, onClose, onDone }: { box: CashBoxDetail; open: boolean; methods: CashMethod[]; onClose: () => void; onDone: (text: string) => void }) {
  const t = useTranslations("cash");
  const format = useCashFormat();
  return (
    <Dialog open={open} onClose={onClose} title={t("closeTitle")} description={`${fullName(box.courier)} · ${format.day(box.businessDate)}`} closeLabel={t("close")}>
      {open && <CloseBoxForm box={box} methods={methods} onDone={onDone} />}
    </Dialog>
  );
}

function CloseBoxForm({ box, methods, onDone }: { box: CashBoxDetail; methods: CashMethod[]; onDone: (text: string) => void }) {
  const t = useTranslations("cash");
  const tp = useTranslations("payment");
  const errorMessage = useErrorMessage();
  const format = useCashFormat();
  // Lo más común: todo en efectivo. Se precarga lo debido si es positivo; se corrige si trajo otra cosa.
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const due = signedCents(box.balance.amountDue);
    return due > 0 ? { [methods[0]?.code ?? "CASH"]: fromCents(due).replace(/\.00$/, "") } : {};
  });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries = methods.map((m) => ({
    code: m.code,
    text: amounts[m.code] ?? "",
    parsed: parsePriceInput(amounts[m.code] ?? ""),
  }));
  const invalid = entries.some((e) => e.text.trim() && !e.parsed);
  const gap = closingGap(
    box.balance.amountDue,
    entries.map((e) => (e.parsed ? toCents(e.parsed) : null)),
  );
  const tone = gapTone(gap);
  const needsNote = gap !== 0;
  const ready = !invalid && (!needsNote || noteOk(notes));

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const received = entries.filter((e) => e.parsed && toCents(e.parsed) > 0).map((e) => ({ paymentMethod: e.code, amount: e.parsed! }));
      await container.cash.close(box.id, {
        received,
        notes: notes.trim() || undefined,
      });
      onDone(
        t(`closeDone.${tone}`, {
          name: box.courier.givenNames.split(" ")[0],
          amount: format.cents(gap),
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-white">
        <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">{signedCents(box.balance.amountDue) < 0 ? t("owedToCourier") : t("mustDeliver")}</span>
        <span className="font-display text-3xl font-extrabold tabular-nums">{format.amount(box.balance.amountDue)}</span>
      </div>

      {box.uncollected.length > 0 && <Alert tone="info">{t("closeUncollected", { count: box.uncollected.length })}</Alert>}

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-sm font-semibold text-ink/80">{t("receivedLabel")}</legend>
        {entries.map((e) => (
          <label key={e.code} className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-leaf" aria-hidden>
              {createElement(paymentIcon(e.code as PaymentMethodCode), {
                className: "size-4",
              })}
            </span>
            <span className="w-28 shrink-0 text-sm font-bold">{tp.has(e.code) ? tp(e.code) : e.code}</span>
            <input
              inputMode="decimal"
              value={e.text}
              onChange={(ev) => setAmounts((a) => ({ ...a, [e.code]: ev.target.value }))}
              placeholder="0"
              aria-invalid={!!e.text.trim() && !e.parsed}
              className={`${inputClass} text-right font-display font-extrabold tabular-nums`}
            />
          </label>
        ))}
      </fieldset>

      <div className="flex items-center justify-center" aria-live="polite">
        <span className={`cash-stamp ${GAP_STAMP[tone]}`}>
          <Scale className="size-5" aria-hidden />
          {t(`gap.${tone}`, { amount: format.cents(gap) })}
        </span>
      </div>

      <NoteField value={notes} onChange={setNotes} label={needsNote ? t("closeNoteRequired") : t("noteOptional")} hint={needsNote ? t("closeNoteHint") : undefined} required={needsNote} />
      {error && <Alert>{error}</Alert>}
      <Button variant="dark" block onClick={submit} loading={busy} disabled={!ready}>
        <Scale className="size-4 text-brand" aria-hidden /> {t("closeConfirm")}
      </Button>
    </div>
  );
}
