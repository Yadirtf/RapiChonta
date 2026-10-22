"use client";

import { Banknote, Plus, Trash2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { CourierDetail, IdentityOptions, NewCourier } from "@/core/domain/entities/staff";
import { container } from "@/infrastructure/di/container";
import { looksLikeMobile, phoneDigits } from "../../../components/auth/PhoneInput";
import { emptyPerson, FormSection, PersonFields, type PersonForm } from "../../../components/panel/PersonFields";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { SelectField, TextField } from "../../../components/ui/Field";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { usePanelMunicipality } from "../PanelMunicipality";

type AccountForm = NewCourier["collectionAccounts"][number] & { key: number };

const FUNDING_ICONS: Record<string, typeof Wallet> = { CASH_BOX: Banknote, OWN_FUNDS: Wallet };

interface Props {
  open: boolean;
  options: IdentityOptions | null;
  onClose: () => void;
  onCreated: (courier: CourierDetail) => void;
}

/**
 * H01.3: el administrador registra al domiciliario. Queda PENDIENTE de verificación: no recibe ofertas
 * hasta que alguien con permiso lo verifique.
 */
export function CreateCourierDialog({ open, options, onClose, onCreated }: Props) {
  const t = useTranslations("couriers");
  const tc = useTranslations("catalog");
  const tp = useTranslations("people");
  const errorMessage = useErrorMessage();
  const { municipalityId: panelMunicipalityId } = usePanelMunicipality();
  const [person, setPerson] = useState<PersonForm>(emptyPerson);
  const [municipalityId, setMunicipalityId] = useState<number | "">("");
  const [fundingMode, setFundingMode] = useState("");
  const [vehicle, setVehicle] = useState({ type: "", plate: "", description: "" });
  const [accounts, setAccounts] = useState<AccountForm[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Valores por defecto en cuanto llegan los catálogos. El municipio es el del panel ("Trabajando en"), o el
  // primero que opera: nunca el primero del alfabeto, que dejaba al domiciliario en un despacho que no existe.
  useEffect(() => {
    if (!options) return;
    const preferred = options.municipalities.find((m) => m.id === panelMunicipalityId) ?? options.municipalities.find((m) => m.launched) ?? options.municipalities[0];
    setMunicipalityId((m) => m || preferred?.id || "");
    setFundingMode((f) => f || options.fundingModes[0] || "");
    setVehicle((v) => (v.type ? v : { ...v, type: options.vehicleTypes[0]?.code ?? "" }));
  }, [options, panelMunicipalityId]);

  const reset = () => {
    setPerson(emptyPerson());
    setVehicle((v) => ({ type: v.type, plate: "", description: "" }));
    setAccounts([]);
    setError(null);
    setLocalError(null);
  };

  const requiresPlate = options?.vehicleTypes.find((v) => v.code === vehicle.type)?.requiresPlate ?? false;
  const requiresBank = (method: string) => options?.paymentMethods.find((p) => p.code === method)?.requiresBank ?? false;

  const addAccount = () => {
    const method = options?.paymentMethods[0]?.code ?? "NEQUI";
    setAccounts((list) => [
      ...list,
      { key: Date.now(), paymentMethod: method, accountNumber: phoneDigits(person.phone), holderName: `${person.givenNames} ${person.familyNames}`.trim() },
    ]);
  };
  const updateAccount = (key: number, patch: Partial<AccountForm>) => setAccounts((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const submit = async () => {
    if (!looksLikeMobile(person.phone)) return setLocalError(t("phoneInvalid"));
    if (requiresPlate && !vehicle.plate.trim()) return setLocalError(t("plateRequired"));
    setLocalError(null);
    setBusy(true);
    setError(null);
    try {
      const created = await container.admin.createCourier({
        ...person,
        givenNames: person.givenNames.trim(),
        familyNames: person.familyNames.trim(),
        documentNumber: person.documentNumber.trim(),
        phone: phoneDigits(person.phone),
        municipalityId: Number(municipalityId),
        fundingMode,
        vehicle: {
          type: vehicle.type,
          plate: requiresPlate ? vehicle.plate.trim().toUpperCase() : undefined,
          description: vehicle.description.trim() || undefined,
        },
        collectionAccounts: accounts.map((a) => ({
          paymentMethod: a.paymentMethod,
          accountNumber: a.accountNumber.trim(),
          holderName: a.holderName.trim(),
          ...(requiresBank(a.paymentMethod) ? { bank: a.bank, bankAccountType: a.bankAccountType } : {}),
        })),
      });
      onCreated(created);
      reset();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  // La API ya entrega solo los medios con cuenta propia del domiciliario (Nequi, Daviplata, transferencia).
  const accountMethods = options?.paymentMethods ?? [];

  return (
    <Dialog open={open} onClose={onClose} side size="lg" title={t("createTitle")} description={t("createSubtitle")}>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FormSection title={t("sectionPerson")}>
          <PersonFields value={person} onChange={setPerson} documentTypes={options?.documentTypes ?? ["CC"]} />
        </FormSection>

        <FormSection title={t("sectionOperation")}>
          {options && options.municipalities.length > 1 && (
            <MunicipalitySelect label={tp("municipality")} municipalities={options.municipalities} value={municipalityId} onChange={setMunicipalityId} />
          )}
          <div role="radiogroup" aria-label={t("fundingMode")} className="grid gap-2 sm:grid-cols-2">
            {(options?.fundingModes ?? []).map((mode) => {
              const Icon = FUNDING_ICONS[mode] ?? Wallet;
              const checked = fundingMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setFundingMode(mode)}
                  className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${checked ? "border-ink bg-brand/10 ring-1 ring-ink" : "border-ink/12 hover:border-ink/30"}`}
                >
                  <Icon className={`mt-0.5 size-5 shrink-0 ${checked ? "text-ink" : "text-ink/40"}`} aria-hidden />
                  <span>
                    <span className="block text-sm font-bold">{tc(`fundingModes.${mode}`)}</span>
                    <span className="block text-xs text-ink/55">{tc(`fundingModeHints.${mode}`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </FormSection>

        <FormSection title={t("sectionVehicle")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label={t("vehicleType")} value={vehicle.type} onChange={(e) => setVehicle({ ...vehicle, type: e.target.value })}>
              {(options?.vehicleTypes ?? []).map((v) => (
                <option key={v.code} value={v.code}>
                  {tc(`vehicleTypes.${v.code}`)}
                </option>
              ))}
            </SelectField>
            {requiresPlate && (
              <TextField label={t("plate")} value={vehicle.plate} onChange={(e) => setVehicle({ ...vehicle, plate: e.target.value.toUpperCase() })} placeholder="ABC12D" maxLength={10} required />
            )}
          </div>
          <TextField label={t("vehicleDescription")} value={vehicle.description} onChange={(e) => setVehicle({ ...vehicle, description: e.target.value })} placeholder={t("vehicleDescriptionPlaceholder")} maxLength={120} />
        </FormSection>

        <FormSection title={t("sectionAccounts")} description={t("accountsHint")}>
          {accounts.map((a) => (
            <div key={a.key} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
              <div className="flex items-end gap-2">
                <SelectField containerClassName="flex-1" label={t("paymentMethod")} value={a.paymentMethod} onChange={(e) => updateAccount(a.key, { paymentMethod: e.target.value })}>
                  {accountMethods.map((p) => (
                    <option key={p.code} value={p.code}>
                      {tc(`paymentMethods.${p.code}`)}
                    </option>
                  ))}
                </SelectField>
                <Button variant="ghost" className="h-12 text-red-600 hover:bg-red-50" aria-label={t("removeAccount")} onClick={() => setAccounts((list) => list.filter((x) => x.key !== a.key))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {requiresBank(a.paymentMethod) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label={t("bank")} value={a.bank ?? ""} onChange={(e) => updateAccount(a.key, { bank: e.target.value })} required>
                    <option value="" disabled>
                      {t("choose")}
                    </option>
                    {(options?.banks ?? []).map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField label={t("bankAccountType")} value={a.bankAccountType ?? ""} onChange={(e) => updateAccount(a.key, { bankAccountType: e.target.value })} required>
                    <option value="" disabled>
                      {t("choose")}
                    </option>
                    {(options?.bankAccountTypes ?? []).map((code) => (
                      <option key={code} value={code}>
                        {tc(`bankAccountTypes.${code}`)}
                      </option>
                    ))}
                  </SelectField>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label={t("accountNumber")} value={a.accountNumber} onChange={(e) => updateAccount(a.key, { accountNumber: e.target.value })} inputMode="numeric" maxLength={30} required />
                <TextField label={t("holderName")} value={a.holderName} onChange={(e) => updateAccount(a.key, { holderName: e.target.value })} maxLength={120} required />
              </div>
            </div>
          ))}
          {accounts.length < 5 && (
            <Button variant="outline" onClick={addAccount} className="self-start">
              <Plus className="size-4" aria-hidden /> {t("addAccount")}
            </Button>
          )}
        </FormSection>

        {localError && <Alert>{localError}</Alert>}
        {error ? <Alert>{errorMessage(error)}</Alert> : null}

        <div className="sticky bottom-0 -mx-6 -mb-6 flex gap-2 border-t border-ink/8 bg-white/95 px-6 py-4 backdrop-blur">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="flex-[2]" loading={busy} disabled={!options}>
            {t("create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Municipio del domiciliario: el despacho de cada municipio solo ve a los suyos. Los que operan van primero y los
 * demás se marcan, y si se elige uno sin operación se advierte (no recibiría pedidos).
 */
export function MunicipalitySelect({
  label,
  municipalities,
  value,
  onChange,
}: {
  label: string;
  municipalities: IdentityOptions["municipalities"];
  value: number | "";
  onChange: (id: number) => void;
}) {
  const t = useTranslations("couriers");
  const chosen = municipalities.find((m) => m.id === value);
  return (
    <SelectField
      label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      hint={chosen && !chosen.launched ? t("municipalityNotOperatingHint", { name: chosen.name }) : undefined}
    >
      {municipalities.map((m) => (
        <option key={m.id} value={m.id}>
          {m.launched ? m.name : t("municipalityNotOperating", { name: m.name })}
        </option>
      ))}
    </SelectField>
  );
}
