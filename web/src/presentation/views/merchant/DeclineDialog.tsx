"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CounterOrder } from "@/core/domain/entities/merchant";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { TextField } from "../../components/ui/Field";

/** "No puedo atenderlo": el comercio elige uno de sus motivos (el cliente recibe el aviso de cancelado). */
export function DeclineDialog({
  order,
  reasons,
  onClose,
  onDecline,
}: {
  order: CounterOrder | null;
  reasons: string[];
  onClose: () => void;
  onDecline: (reason: string, notes?: string) => Promise<void>;
}) {
  const t = useTranslations("merchant.decline");
  return (
    <Dialog open={!!order} onClose={onClose} title={t("title", { code: order?.code ?? "" })} description={t("body")}>
      {/* Una comanda nueva empieza sin motivo elegido. */}
      <DeclineForm key={order?.code} reasons={reasons} onClose={onClose} onDecline={onDecline} />
    </Dialog>
  );
}

function DeclineForm({
  reasons,
  onClose,
  onDecline,
}: {
  reasons: string[];
  onClose: () => void;
  onDecline: (reason: string, notes?: string) => Promise<void>;
}) {
  const t = useTranslations("merchant.decline");
  const tr = useTranslations("merchant.declineReasons");
  const [reason, setReason] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!reason) return;
        setBusy(true);
        try {
          await onDecline(reason, notes.trim() || undefined);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-2" role="radiogroup" aria-label={t("reason")}>
        {reasons.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={reason === code}
            onClick={() => setReason(code)}
            className={`rounded-2xl px-4 py-3 text-left text-sm font-bold ring-1 transition-colors ${
              reason === code ? "bg-chonta-soft text-chonta-strong ring-chonta" : "bg-white ring-ink/10 hover:ring-ink/30"
            }`}
          >
            {tr(code)}
          </button>
        ))}
      </div>
      <TextField label={t("notes")} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" block variant="danger" disabled={!reason} loading={busy}>
          {t("confirm")}
        </Button>
      </div>
    </form>
  );
}
