"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DISPUTE_RESOLUTIONS, MAX_NOTE_LENGTH, MIN_NOTE_LENGTH, type DeskIncident, type DeskOrderDetail, type IncidentType, type ProofOutcome } from "@/core/domain/entities/desk";
import type { IncidentResolution } from "@/core/domain/entities/order";
import { container } from "@/infrastructure/di/container";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { FieldShell, inputClass } from "../../../components/ui/Field";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";

export type DeskAction = { kind: "cancel" } | { kind: "proof"; outcome: ProofOutcome } | { kind: "resolve"; incident: DeskIncident };

/** Al investigar una foto se dice qué se sospecha; ambos tipos ponen el pedido en revisión. */
const INVESTIGATE_TYPES: IncidentType[] = ["NOT_RECEIVED", "OTHER"];

/**
 * Toda decisión del panel pasa por aquí: se elige (motivo, resolución o sospecha) y se escribe por qué. El
 * comentario es obligatorio porque queda en la línea de tiempo y en la auditoría del personal.
 */
export function DeskActionDialog({ order, action, onClose, onDone }: { order: DeskOrderDetail; action: DeskAction | null; onClose: () => void; onDone: (text: string) => void }) {
  // Cada acción monta su formulario de cero: empieza limpia, con la opción más común ya marcada.
  return action ? <ActionForm order={order} action={action} onClose={onClose} onDone={onDone} /> : null;
}

function initialChoice(order: DeskOrderDetail, action: DeskAction): string | null {
  if (action.kind === "resolve") return order.status === "DISPUTED" ? DISPUTE_RESOLUTIONS[0] : "NO_ORDER_CHANGE";
  if (action.kind === "proof" && action.outcome === "INVESTIGATE") return INVESTIGATE_TYPES[0];
  return null;
}

function ActionForm({ order, action, onClose, onDone }: { order: DeskOrderDetail; action: DeskAction; onClose: () => void; onDone: (text: string) => void }) {
  const t = useTranslations("desk");
  const to = useTranslations("orders");
  const errorMessage = useErrorMessage();
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState<string | null>(() => initialChoice(order, action));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const reasons = useResource(() => (action.kind === "cancel" ? container.desk.cancellationReasons() : Promise.resolve([])), [action.kind]);

  const options: string[] =
    action.kind === "cancel"
      ? (reasons.data ?? [])
      : action.kind === "resolve"
        ? order.status === "DISPUTED"
          ? DISPUTE_RESOLUTIONS
          : ["NO_ORDER_CHANGE"]
        : action.outcome === "INVESTIGATE"
          ? INVESTIGATE_TYPES
          : [];
  const label = (option: string) =>
    action.kind === "cancel" ? (to.has(`cancelReasons.${option}`) ? to(`cancelReasons.${option}`) : option) : action.kind === "resolve" ? t(`resolutions.${option}.label`) : t(`incidentTypes.${option}`);
  const hint = (option: string) => (action.kind === "resolve" ? t(`resolutions.${option}.body`) : null);

  const key = action.kind === "proof" ? `proofOutcomes.${action.outcome}` : action.kind === "resolve" ? "resolveDialog" : "cancel";
  const ready = note.trim().length >= MIN_NOTE_LENGTH && (options.length === 0 || !!choice);
  const destructive = (action.kind === "proof" && action.outcome === "CANCELLED") || action.kind === "cancel" || choice === "RESOLVED_AS_CANCELLED";

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const notes = note.trim();
      if (action.kind === "cancel") await container.desk.cancel(order.code, { reason: choice!, notes });
      else if (action.kind === "resolve") await container.desk.resolveIncident(action.incident.id, { resolution: choice as IncidentResolution, notes });
      else
        await container.desk.reviewProof(order.code, {
          outcome: action.outcome,
          notes,
          incidentType: action.outcome === "INVESTIGATE" ? (choice as IncidentType) : action.outcome === "CANCELLED" ? "NOT_RECEIVED" : undefined,
        });
      onDone(t(`${key}.done`, { code: order.code }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} title={t(`${key}.title`, { code: order.code })} description={t(`${key}.body`)} closeLabel={t("close")} size="md">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        {options.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-ink/80">{t(`${key}.choice`)}</legend>
            {options.map((option) => {
              const selected = choice === option;
              return (
                <label
                  key={option}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 ring-1 transition ${selected ? "bg-cream ring-2 ring-ink" : "bg-white ring-ink/12 hover:ring-ink/30"}`}
                >
                  <input type="radio" name="choice" value={option} checked={selected} onChange={() => setChoice(option)} className="sr-only" />
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-ink bg-brand" : "border-ink/25"}`} aria-hidden>
                    {selected && <Check className="size-3" strokeWidth={3.5} />}
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-bold">{label(option)}</span>
                    {hint(option) && <span className="block text-ink/60">{hint(option)}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <FieldShell label={t("noteLabel")} hint={t("noteHint", { min: MIN_NOTE_LENGTH })}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              data-autofocus
              aria-describedby={describedBy}
              value={note}
              maxLength={MAX_NOTE_LENGTH}
              rows={3}
              placeholder={t(`${key}.placeholder`)}
              onChange={(e) => setNote(e.target.value)}
              className={`${inputClass} h-auto resize-none py-3`}
            />
          )}
        </FieldShell>
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("back")}
          </Button>
          <Button type="submit" variant={destructive ? "danger" : "dark"} loading={busy} disabled={!ready}>
            {t(`${key}.confirm`)}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
