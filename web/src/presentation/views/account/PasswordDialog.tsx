"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { container } from "@/infrastructure/di/container";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { TextField } from "../../components/ui/Field";
import { useErrorMessage } from "../../hooks/useErrorMessage";

/** Política de contraseñas (la API la vuelve a verificar): 10 a 128 caracteres. */
export const PASSWORD_MIN = 10;

export function PasswordDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("account");
  const errorMessage = useErrorMessage();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== next;

  const close = () => {
    onClose();
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await container.account.changePassword(current, next);
      onChanged();
      close();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title={t("changePasswordTitle")} description={t("changePasswordSubtitle")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label={t("currentPassword")} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <TextField
          label={t("newPassword")}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={PASSWORD_MIN}
          maxLength={128}
          hint={t("passwordPolicy", { min: PASSWORD_MIN })}
          required
        />
        <TextField
          label={t("confirmPassword")}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? t("passwordMismatch") : null}
          required
        />
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <Button type="submit" size="lg" block loading={busy} disabled={!current || next.length < PASSWORD_MIN || next !== confirm}>
          {t("savePassword")}
        </Button>
      </form>
    </Dialog>
  );
}
