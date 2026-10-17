"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { AdminCategory, CategoryInput } from "@/core/domain/entities/catalog-admin";
import { CategoryIcon } from "../../../components/catalog/CategoryIcon";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { TextField } from "../../../components/ui/Field";
import { useErrorMessage } from "../../../hooks/useErrorMessage";

/** "Comida rápida" → "COMIDA_RAPIDA": el mismo código que propondría la API. */
export const codeFromName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "C_$1")
    .slice(0, 40);

interface Props {
  open: boolean;
  category: AdminCategory | null;
  icons: string[];
  onClose: () => void;
  onSubmit: (input: CategoryInput) => Promise<void>;
}

export function CategoryDialog({ open, category, icons, onClose, onSubmit }: Props) {
  const t = useTranslations("categoriesAdmin");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const [es, setEs] = useState("");
  const [en, setEn] = useState("");
  const [icon, setIcon] = useState(icons[0] ?? "store");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setEs(category?.names.es ?? "");
    setEn(category?.names.en ?? "");
    setIcon(category?.icon ?? icons[0] ?? "store");
    setCode(category?.code ?? "");
    setCodeTouched(false);
    setError(null);
  }, [open, category, icons]);

  const effectiveCode = category ? category.code : codeTouched ? code : codeFromName(es);
  const preview = (locale === "en" && en) || es || t("namePreview");

  return (
    <Dialog open={open} onClose={onClose} size="md" title={category ? t("edit") : t("new")} description={t("dialogHint")} closeLabel={t("close")}>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSubmit({ code: category ? undefined : effectiveCode, icon, names: { es: es.trim(), en: en.trim() || undefined } });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex items-center gap-3 rounded-3xl bg-ink p-4 text-white">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand text-ink">
            <CategoryIcon name={icon} className="size-6" />
          </span>
          <div>
            <p className="text-xs text-white/50">{t("preview")}</p>
            <p className="font-display text-lg font-extrabold">{preview}</p>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-ink/80">{t("icon")}</legend>
          <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            {icons.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={icon === name}
                aria-label={name}
                title={name}
                onClick={() => setIcon(name)}
                className={`grid aspect-square place-items-center rounded-xl transition ${icon === name ? "bg-ink text-brand shadow-md" : "bg-surface text-ink/60 hover:bg-ink/10 hover:text-ink"}`}
              >
                <CategoryIcon name={name} className="size-5" />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("nameEs")} value={es} onChange={(e) => setEs(e.target.value)} maxLength={80} required />
          <TextField label={t("nameEn")} value={en} onChange={(e) => setEn(e.target.value)} maxLength={80} hint={t("optional")} />
        </div>
        <TextField
          label={t("code")}
          value={effectiveCode}
          disabled={!!category}
          onChange={(e) => {
            setCodeTouched(true);
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 40));
          }}
          hint={category ? t("codeFixed") : t("codeHint")}
          className="font-mono"
        />

        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <Button type="submit" size="lg" block loading={busy} disabled={!es.trim() || effectiveCode.length < 2}>
          {category ? t("save") : t("create")}
        </Button>
      </form>
    </Dialog>
  );
}
