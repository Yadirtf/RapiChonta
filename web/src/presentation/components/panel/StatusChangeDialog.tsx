"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FieldShell, inputClass } from "../ui/Field";
import { useErrorMessage } from "../../hooks/useErrorMessage";

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

/** Confirmación de un cambio de estado con motivo opcional (queda en el historial y en la auditoría). */
export function StatusChangeDialog({ open, title, body, confirmLabel, destructive, onClose, onConfirm }: Props) {
  const t = useTranslations("panel");
  const errorMessage = useErrorMessage();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const close = () => {
    onClose();
    setReason("");
    setError(null);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      close();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title={title} description={body}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
      >
        <FieldShell label={t("reason")} hint={t("reasonHint")}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              value={reason}
              maxLength={300}
              rows={3}
              onChange={(e) => setReason(e.target.value)}
              className={`${inputClass} h-auto resize-none py-3`}
            />
          )}
        </FieldShell>
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={close}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant={destructive ? "danger" : "dark"} className="flex-1" loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
