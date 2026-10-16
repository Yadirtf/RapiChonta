"use client";

import { Dices, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { PersonInput } from "@/core/domain/entities/staff";
import { PhoneInput } from "../auth/PhoneInput";
import { SelectField, TextField } from "../ui/Field";

/** Contraseña inicial legible (sin caracteres ambiguos) para entregarla en persona. */
export function generatePassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (v) => alphabet[v % alphabet.length]).join("");
}

export type PersonForm = PersonInput;

export const emptyPerson = (): PersonForm => ({
  givenNames: "",
  familyNames: "",
  documentType: "CC",
  documentNumber: "",
  phone: "",
  password: generatePassword(),
});

/** Datos de la persona y su contraseña inicial: comunes a domiciliarios y personal. */
export function PersonFields({ value, onChange, documentTypes }: { value: PersonForm; onChange: (v: PersonForm) => void; documentTypes: string[] }) {
  const t = useTranslations("people");
  const ta = useTranslations("auth");
  const td = useTranslations("documentTypes");
  const [showPassword, setShowPassword] = useState(true);
  const set = (patch: Partial<PersonForm>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={ta("givenNames")} value={value.givenNames} onChange={(e) => set({ givenNames: e.target.value })} maxLength={80} required data-autofocus />
        <TextField label={t("familyNames")} value={value.familyNames} onChange={(e) => set({ familyNames: e.target.value })} maxLength={80} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <SelectField label={t("documentType")} value={value.documentType} onChange={(e) => set({ documentType: e.target.value })}>
          {documentTypes.map((code) => (
            <option key={code} value={code}>
              {td.has(code) ? td(code) : code}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t("documentNumber")}
          value={value.documentNumber}
          onChange={(e) => set({ documentNumber: e.target.value })}
          maxLength={20}
          required
        />
      </div>
      <PhoneInput label={ta("phoneLabel")} value={value.phone} onChange={(phone) => set({ phone })} hint={t("phoneHint")} />
      <div className="relative">
        <TextField
          label={t("initialPassword")}
          type={showPassword ? "text" : "password"}
          value={value.password}
          onChange={(e) => set({ password: e.target.value })}
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          className="pr-24 font-mono"
          hint={t("initialPasswordHint")}
          required
        />
        <div className="absolute right-1.5 top-8 flex">
          <button type="button" onClick={() => set({ password: generatePassword() })} aria-label={t("generatePassword")} title={t("generatePassword")} className="grid size-9 place-items-center rounded-xl text-ink/50 hover:bg-ink/5 hover:text-ink">
            <Dices className="size-4.5" />
          </button>
          <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? t("hidePassword") : t("showPassword")} className="grid size-9 place-items-center rounded-xl text-ink/50 hover:bg-ink/5 hover:text-ink">
            {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-ink/8 pt-5 first:border-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-sm font-bold uppercase tracking-wider text-ink/45">{title}</p>
        {description && <p className="mt-0.5 text-sm text-ink/55">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}
