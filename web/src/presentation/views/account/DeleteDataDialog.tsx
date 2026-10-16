"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { container } from "@/infrastructure/di/container";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { TextField } from "../../components/ui/Field";
import { useErrorMessage } from "../../hooks/useErrorMessage";

/** Eliminación de datos (Ley 1581 de 2012): se pide escribir una palabra para evitar toques accidentales. */
export function DeleteDataDialog({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => void }) {
  const t = useTranslations("account");
  const errorMessage = useErrorMessage();
  const word = t("deleteWord");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await container.account.deleteMyData();
      onDeleted();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        setTyped("");
      }}
      title={t("deleteTitle")}
      description={t("deleteSubtitle")}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink/70">
          <li>{t("deleteConsequence1")}</li>
          <li>{t("deleteConsequence2")}</li>
          <li>{t("deleteConsequence3")}</li>
        </ul>
        <TextField
          label={t("deleteConfirmLabel", { word })}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
        />
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <Button type="submit" variant="danger" size="lg" block loading={busy} disabled={typed.trim().toUpperCase() !== word.toUpperCase()}>
          <Trash2 className="size-4" aria-hidden /> {t("deleteConfirm")}
        </Button>
      </form>
    </Dialog>
  );
}
