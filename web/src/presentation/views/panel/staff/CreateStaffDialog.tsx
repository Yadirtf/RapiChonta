"use client";

import { Headset, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { IdentityOptions, NewStaffMember } from "@/core/domain/entities/staff";
import { container } from "@/infrastructure/di/container";
import { looksLikeMobile, phoneDigits } from "../../../components/auth/PhoneInput";
import { emptyPerson, FormSection, PersonFields, type PersonForm } from "../../../components/panel/PersonFields";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { SelectField } from "../../../components/ui/Field";
import { useErrorMessage } from "../../../hooks/useErrorMessage";

const ROLE_OPTIONS = [
  { role: "OPERATOR", icon: Headset },
  { role: "ADMIN", icon: ShieldCheck },
] as const;

/** H01.4: el administrador crea operadores (con municipio) y otros administradores. */
export function CreateStaffDialog({ open, options, onClose, onCreated }: { open: boolean; options: IdentityOptions | null; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("staff");
  const tr = useTranslations("roles");
  const tp = useTranslations("people");
  const errorMessage = useErrorMessage();
  const [role, setRole] = useState<NewStaffMember["role"]>("OPERATOR");
  const [person, setPerson] = useState<PersonForm>(emptyPerson);
  const [municipalityId, setMunicipalityId] = useState<number | "">("");
  const [error, setError] = useState<unknown>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const municipality = municipalityId || options?.municipalities[0]?.id;

  const submit = async () => {
    if (!looksLikeMobile(person.phone)) return setLocalError(t("phoneInvalid"));
    setLocalError(null);
    setBusy(true);
    setError(null);
    try {
      await container.admin.createStaff({
        ...person,
        givenNames: person.givenNames.trim(),
        familyNames: person.familyNames.trim(),
        documentNumber: person.documentNumber.trim(),
        phone: phoneDigits(person.phone),
        role,
        municipalityId: role === "OPERATOR" ? Number(municipality) : undefined,
      });
      setPerson(emptyPerson());
      onCreated();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} side size="lg" title={t("createTitle")} description={t("createSubtitle")}>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FormSection title={t("sectionRole")}>
          <div role="radiogroup" aria-label={t("sectionRole")} className="grid gap-2 sm:grid-cols-2">
            {ROLE_OPTIONS.map(({ role: option, icon: Icon }) => {
              const checked = role === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setRole(option)}
                  className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${checked ? "border-ink bg-brand/10 ring-1 ring-ink" : "border-ink/12 hover:border-ink/30"}`}
                >
                  <Icon className={`mt-0.5 size-5 shrink-0 ${checked ? "text-ink" : "text-ink/40"}`} aria-hidden />
                  <span>
                    <span className="block text-sm font-bold">{tr(option)}</span>
                    <span className="block text-xs text-ink/55">{t(`roleHint.${option}`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {role === "OPERATOR" && options && options.municipalities.length > 1 && (
            <SelectField label={tp("municipality")} value={municipality} onChange={(e) => setMunicipalityId(Number(e.target.value))}>
              {options.municipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
          )}
        </FormSection>

        <FormSection title={t("sectionPerson")}>
          <PersonFields value={person} onChange={setPerson} documentTypes={options?.documentTypes ?? ["CC"]} />
        </FormSection>

        {localError && <Alert>{localError}</Alert>}
        {error ? <Alert>{errorMessage(error)}</Alert> : null}

        <div className="sticky bottom-0 -mx-6 -mb-6 flex gap-2 border-t border-ink/8 bg-white/95 px-6 py-4 backdrop-blur">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="flex-[2]" loading={busy} disabled={!options}>
            {t("create", { role: tr(role) })}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
