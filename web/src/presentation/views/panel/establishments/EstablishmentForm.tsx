"use client";

import { Phone, Plus, Star, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { AdminEstablishment, CatalogOptions, EstablishmentInput, EstablishmentPhone } from "@/core/domain/entities/catalog-admin";
import { localized } from "@/core/domain/entities/establishment";
import { areaProblem } from "@/core/domain/entities/geo-area";
import { container } from "@/infrastructure/di/container";
import { CategoryIcon } from "../../../components/catalog/CategoryIcon";
import { ImageUploadButton } from "../../../components/catalog/ImageUploadButton";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { inputClass, SelectField, TextField } from "../../../components/ui/Field";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import type { AreaValue } from "./AreaEditor";

// MapLibre pesa: se descarga solo al abrir el editor y nunca en el servidor.
const AreaEditor = dynamic(() => import("./AreaEditor").then((m) => m.AreaEditor), {
  ssr: false,
  loading: () => <div className="blueprint h-full min-h-[360px] animate-pulse rounded-[28px]" />,
});

const MAX_CATEGORIES = 5;
const MAX_PHONES = 3;

interface Props {
  initial: AdminEstablishment | null;
  options: CatalogOptions;
  onSaved: (establishment: AdminEstablishment, created: boolean) => void;
}

/** Pestaña "Local y área" (H02.1): datos del letrero, categorías, teléfonos, logo, punto y área. */
export function EstablishmentForm({ initial, options, onSaved }: Props) {
  const t = useTranslations("establishmentEditor");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const [name, setName] = useState(initial?.name ?? "");
  const [addressLine, setAddressLine] = useState(initial?.addressLine ?? "");
  const [municipalityId, setMunicipalityId] = useState<number | undefined>(initial?.municipality.id ?? (options.municipalities.length === 1 ? options.municipalities[0].id : undefined));
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? []);
  const [phones, setPhones] = useState<EstablishmentPhone[]>(initial?.phones ?? []);
  const [logo, setLogo] = useState<{ fileId: string | null; url: string | null }>({ fileId: initial?.logoFileId ?? null, url: initial?.logoUrl ?? null });
  const [place, setPlace] = useState<AreaValue>({ location: initial?.location ?? null, area: initial?.area ?? [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const municipality = options.municipalities.find((m) => m.id === municipalityId) ?? options.municipalities[0];
  const fallbackCenter = municipality?.center ?? { lat: 1.0294, lng: -76.6165 };
  const allCategories = useMemo(() => {
    // Una categoría dada de baja sigue visible si el local ya la tenía (para poder quitarla).
    const known = new Set(options.categories.map((c) => c.code));
    return [...options.categories, ...categories.filter((c) => !known.has(c)).map((code) => ({ code, icon: "store", names: { es: code } }))];
  }, [options.categories, categories]);

  const missing = [
    name.trim().length < 2 && "name",
    addressLine.trim().length < 3 && "address",
    !municipalityId && options.municipalities.length > 1 && "municipality",
    categories.length === 0 && "categories",
    !place.location && "location",
    place.location && areaProblem(place.area, place.location, options.limits.area) && "area",
  ].filter(Boolean) as string[];

  const toggleCategory = (code: string) =>
    setCategories((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : prev.length < MAX_CATEGORIES ? [...prev, code] : prev));
  const makePrimary = (code: string) => setCategories((prev) => [code, ...prev.filter((c) => c !== code)]);

  const save = async () => {
    if (missing.length || !place.location) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const input: EstablishmentInput = {
      municipalityId,
      name: name.trim(),
      addressLine: addressLine.trim(),
      location: place.location,
      area: place.area,
      categories,
      phones: phones.filter((p) => p.phone.trim()).map((p) => ({ phone: p.phone.trim(), label: p.label?.trim() || null })),
      logoFileId: logo.fileId,
    };
    try {
      const result = initial ? await container.catalogAdmin.updateEstablishment(initial.id, input) : await container.catalogAdmin.createEstablishment(input);
      setSaved(!!initial);
      onSaved(result, !initial);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-ink/5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <ImageUploadButton
                purpose="ESTABLISHMENT_LOGO"
                label={t("logo")}
                onUploaded={(fileId, url) => setLogo({ fileId, url })}
                onError={setError}
                className="size-20 overflow-hidden rounded-2xl border-2 border-dashed border-ink/15 bg-surface text-ink/40 hover:border-ink/30"
              >
                {logo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo.url} alt="" className="size-full object-cover" />
                ) : (
                  <CategoryIcon name={allCategories.find((c) => c.code === categories[0])?.icon} className="size-7" />
                )}
              </ImageUploadButton>
              {logo.fileId && (
                <button
                  type="button"
                  onClick={() => setLogo({ fileId: null, url: null })}
                  aria-label={t("removeLogo")}
                  className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-ink text-white shadow"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
            <div className="text-sm text-ink/55">
              <p className="font-semibold text-ink">{t("logo")}</p>
              <p>{t("logoHint")}</p>
            </div>
          </div>
          <TextField label={t("name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required placeholder={t("namePlaceholder")} />
          <TextField label={t("address")} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} maxLength={200} required placeholder={t("addressPlaceholder")} />
          {options.municipalities.length > 1 && (
            <SelectField
              label={t("municipality")}
              value={municipalityId ?? ""}
              disabled={!!initial}
              hint={initial ? t("municipalityFixed") : undefined}
              onChange={(e) => setMunicipalityId(Number(e.target.value) || undefined)}
            >
              <option value="">{t("chooseMunicipality")}</option>
              {options.municipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
          )}
        </section>

        <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-ink/5 sm:p-6">
          <h2 className="font-bold">{t("categories")}</h2>
          <p className="text-sm text-ink/55">{t("categoriesHint", { max: MAX_CATEGORIES })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {allCategories.map((c) => {
              const index = categories.indexOf(c.code);
              const selected = index >= 0;
              return (
                <span key={c.code} className={`inline-flex items-center rounded-full ring-1 transition ${selected ? "bg-ink text-white ring-ink" : "bg-white text-ink/70 ring-ink/15 hover:ring-ink/30"}`}>
                  <button type="button" onClick={() => toggleCategory(c.code)} aria-pressed={selected} className="inline-flex h-10 items-center gap-2 pl-3 pr-3.5 text-sm font-semibold">
                    <CategoryIcon name={c.icon} className={`size-4 ${selected ? "text-brand" : ""}`} />
                    {localized(c.names, locale)}
                  </button>
                  {selected && (
                    <button
                      type="button"
                      onClick={() => makePrimary(c.code)}
                      aria-label={index === 0 ? t("primaryCategory") : t("makePrimary")}
                      title={index === 0 ? t("primaryCategory") : t("makePrimary")}
                      className="mr-1 grid size-8 place-items-center rounded-full hover:bg-white/10"
                    >
                      <Star className={`size-4 ${index === 0 ? "fill-brand text-brand" : "text-white/40"}`} aria-hidden />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </section>

        <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-ink/5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold">{t("phones")}</h2>
              <p className="text-sm text-ink/55">{t("phonesHint")}</p>
            </div>
            {phones.length < MAX_PHONES && (
              <Button variant="outline" size="sm" onClick={() => setPhones((p) => [...p, { phone: "", label: null }])}>
                <Plus className="size-4" aria-hidden /> {t("addPhone")}
              </Button>
            )}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {phones.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink/35" aria-hidden />
                  <input
                    aria-label={t("phone")}
                    inputMode="tel"
                    value={p.phone}
                    maxLength={30}
                    onChange={(e) => setPhones((all) => all.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))}
                    placeholder="320 000 0000"
                    className={`${inputClass} pl-10`}
                  />
                </div>
                <input
                  aria-label={t("phoneLabel")}
                  value={p.label ?? ""}
                  maxLength={40}
                  onChange={(e) => setPhones((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder={t("phoneLabelPlaceholder")}
                  className={`${inputClass} max-w-40`}
                />
                <button type="button" onClick={() => setPhones((all) => all.filter((_, j) => j !== i))} aria-label={t("removePhone")} className="grid size-11 place-items-center rounded-xl text-ink/45 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:self-start">
        <div className="h-[460px] lg:h-auto lg:min-h-0 lg:flex-1">
          <AreaEditor value={place} fallbackCenter={fallbackCenter} limits={options.limits.area} onChange={setPlace} />
        </div>
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        {saved && !error ? <Alert tone="success">{t("saved")}</Alert> : null}
        <div className="flex flex-col gap-2 rounded-[22px] bg-ink p-3 text-white sm:flex-row sm:items-center">
          <p className="flex-1 px-2 text-sm text-white/70">{missing.length ? t("missing", { items: missing.map((m) => t(`missingItems.${m}`)).join(", ") }) : t("ready")}</p>
          <Button type="submit" size="lg" loading={busy} disabled={missing.length > 0}>
            {initial ? t("save") : t("create")}
          </Button>
        </div>
      </div>
    </form>
  );
}
