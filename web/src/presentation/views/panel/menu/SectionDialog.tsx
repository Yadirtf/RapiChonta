"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Translations } from "@/core/domain/entities/establishment";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { TextField } from "../../../components/ui/Field";
import { useErrorMessage } from "../../../hooks/useErrorMessage";

interface Props {
  open: boolean;
  initial?: Translations<string>;
  onClose: () => void;
  onSubmit: (names: Translations<string>) => Promise<void>;
}

/** Nombre de una sección del menú en español (obligatorio) e inglés. */
export function SectionDialog({ open, initial, onClose, onSubmit }: Props) {
  const t = useTranslations("menuEditor");
  const errorMessage = useErrorMessage();
  const [es, setEs] = useState("");
  const [en, setEn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setEs(initial?.es ?? "");
    setEn(initial?.en ?? "");
    setError(null);
  }, [open, initial]);

  return (
    <Dialog open={open} onClose={onClose} title={initial ? t("renameSection") : t("newSection")} description={t("sectionHint")} closeLabel={t("close")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSubmit({ es: es.trim(), en: en.trim() || undefined });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField label={t("nameEs")} value={es} onChange={(e) => setEs(e.target.value)} maxLength={80} required placeholder={t("sectionPlaceholder")} />
        <TextField label={t("nameEn")} value={en} onChange={(e) => setEn(e.target.value)} maxLength={80} hint={t("optionalEnglish")} />
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <Button type="submit" size="lg" block loading={busy} disabled={!es.trim()}>
          {t("save")}
        </Button>
      </form>
    </Dialog>
  );
}
