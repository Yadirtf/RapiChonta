"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ban, ChevronDown, History, ImagePlus, Star, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { AdminProduct, AdminSection, MenuLimits, ProductInput, ProductVersion } from "@/core/domain/entities/catalog-admin";
import type { ContentLanguage } from "@/core/domain/entities/establishment";
import { parsePriceInput, toCents } from "@/core/domain/entities/money";
import { container } from "@/infrastructure/di/container";
import { ImageUploadButton } from "../../../components/catalog/ImageUploadButton";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { FieldShell, inputClass, SelectField } from "../../../components/ui/Field";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";
import { useErrorMessage } from "../../../hooks/useErrorMessage";

const PREP_PRESETS = [0, 5, 10, 15, 20, 30, 45, 60];

interface Props {
  open: boolean;
  establishmentId: string;
  sections: AdminSection[];
  product: AdminProduct | null;
  defaultSectionId?: string;
  limits: MenuLimits;
  onClose: () => void;
  /** Tras guardar; `created` deja el diálogo abierto en el producto nuevo para agregar fotos. */
  onSaved: (productId: string, result: { created: boolean; newVersion: boolean }) => Promise<void>;
  onImagesChanged: () => Promise<void>;
}

/** "12000.00" → "12.000" (lo que escribe una persona en Colombia). */
function priceToInput(decimal: string): string {
  const cents = toCents(decimal);
  const integer = Math.trunc(cents / 100).toLocaleString("es-CO");
  return cents % 100 ? `${integer},${String(cents % 100).padStart(2, "0")}` : integer;
}

/**
 * Producto (H02.2, H02.3): textos en español e inglés, precio, tiempo de preparación, fotos e historial.
 * Cambiar precio, tiempo o textos crea una versión nueva; los pedidos ya hechos conservan la suya.
 */
export function ProductDialog({ open, establishmentId, sections, product, defaultSectionId, limits, onClose, onSaved, onImagesChanged }: Props) {
  const t = useTranslations("menuEditor");
  const errorMessage = useErrorMessage();
  const money = useCatalogFormat();
  const [language, setLanguage] = useState<ContentLanguage>("es");
  const [texts, setTexts] = useState({ es: { name: "", description: "" }, en: { name: "", description: "" } });
  const [sectionId, setSectionId] = useState("");
  const [price, setPrice] = useState("");
  const [prep, setPrep] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmDiscontinue, setConfirmDiscontinue] = useState(false);
  const productId = product?.id;

  useEffect(() => {
    if (!open) return;
    setLanguage("es");
    setTexts({
      es: { name: product?.texts.es.name ?? "", description: product?.texts.es.description ?? "" },
      en: { name: product?.texts.en?.name ?? "", description: product?.texts.en?.description ?? "" },
    });
    setSectionId(product?.sectionId ?? defaultSectionId ?? sections[0]?.id ?? "");
    setPrice(product ? priceToInput(product.price) : "");
    setPrep(product?.prepMinutes ?? 10);
    setError(null);
    setConfirmDiscontinue(false);
  }, [open, productId]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedPrice = parsePriceInput(price);
  const priceError = price && !parsedPrice ? t("priceInvalid") : null;
  const valid = !!texts.es.name.trim() && !!parsedPrice && !!sectionId;

  const save = async () => {
    if (!parsedPrice) return;
    setBusy(true);
    setError(null);
    const en = texts.en.name.trim() ? { name: texts.en.name.trim(), description: texts.en.description.trim() || null } : undefined;
    const input: ProductInput = {
      sectionId,
      texts: { es: { name: texts.es.name.trim(), description: texts.es.description.trim() || null }, en },
      price: parsedPrice,
      prepMinutes: prep,
    };
    try {
      if (product) {
        const { newVersion } = await container.catalogAdmin.updateProduct(product.id, input);
        await onSaved(product.id, { created: false, newVersion });
      } else {
        const id = await container.catalogAdmin.createProduct(establishmentId, input);
        await onSaved(id, { created: true, newVersion: true });
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      await onImagesChanged();
    } catch (e) {
      setError(e);
    }
  };

  const discontinue = async () => {
    if (!product) return;
    setBusy(true);
    try {
      await container.catalogAdmin.changeProductStatus(product.id, "DISCONTINUED");
      await onSaved(product.id, { created: false, newVersion: false });
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const setText = (field: "name" | "description", value: string) => setTexts((all) => ({ ...all, [language]: { ...all[language], [field]: value } }));

  return (
    <Dialog open={open} onClose={onClose} side title={product ? t("editProduct") : t("newProduct")} description={product ? t("versionHint") : t("newProductHint")} closeLabel={t("close")}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {/* Vista previa con la etiqueta de precio: así lo verá el cliente. */}
        <div className="flex items-center gap-4 rounded-3xl bg-cream p-4 [--tag-hole:var(--color-cream)]">
          <div className="size-16 shrink-0 overflow-hidden rounded-2xl bg-white">
            {product?.images[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.images[0].url} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-ink/20">
                <ImagePlus className="size-6" aria-hidden />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <span className="price-tag text-sm">{parsedPrice ? money.price(parsedPrice) : "$ —"}</span>
            <p className="mt-1.5 truncate font-display text-lg font-extrabold">{texts.es.name || t("namePreview")}</p>
          </div>
        </div>

        <div>
          <div role="tablist" aria-label={t("language")} className="inline-flex rounded-2xl bg-surface p-1">
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={language === l}
                onClick={() => setLanguage(l)}
                className={`h-9 rounded-xl px-4 text-sm font-bold transition ${language === l ? "bg-white text-ink shadow-sm" : "text-ink/55"}`}
              >
                {t(`languages.${l}`)}
                {l === "en" && !texts.en.name && <span className="ml-1.5 text-xs font-medium text-ink/40">{t("optional")}</span>}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <FieldShell label={t("productName")}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={texts[language].name}
                  onChange={(e) => setText("name", e.target.value)}
                  maxLength={120}
                  required={language === "es"}
                  placeholder={language === "es" ? t("namePlaceholder") : t("namePlaceholderEn")}
                  className={inputClass}
                />
              )}
            </FieldShell>
            <FieldShell label={t("description")} hint={`${texts[language].description.length}/600`}>
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  aria-describedby={describedBy}
                  value={texts[language].description}
                  onChange={(e) => setText("description", e.target.value)}
                  maxLength={600}
                  rows={3}
                  placeholder={t("descriptionPlaceholder")}
                  className={`${inputClass} h-auto resize-none py-3`}
                />
              )}
            </FieldShell>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell label={t("price")} error={priceError} hint={t("priceHint")}>
            {({ id, describedBy, invalid }) => (
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-bold text-ink/45">$</span>
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="12.000"
                  required
                  className={`${inputClass} pl-8 font-display text-lg font-extrabold tabular-nums`}
                />
              </div>
            )}
          </FieldShell>
          <SelectField label={t("section")} value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.names.es}
              </option>
            ))}
          </SelectField>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-ink/80">{t("prep")}</legend>
          <p className="text-xs text-ink/50">{t("prepHint")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {PREP_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={prep === m}
                onClick={() => setPrep(m)}
                className={`h-9 rounded-full px-3.5 text-sm font-bold transition ${prep === m ? "bg-ink text-brand" : "bg-surface text-ink/65 hover:text-ink"}`}
              >
                {m === 0 ? t("prepReady") : t("minutes", { count: m })}
              </button>
            ))}
            <label className="ml-1 inline-flex items-center gap-1.5 text-sm text-ink/60">
              <input
                type="number"
                min={limits.prepMinutes.min}
                max={limits.prepMinutes.max}
                value={prep}
                onChange={(e) => setPrep(Math.max(limits.prepMinutes.min, Math.min(limits.prepMinutes.max, Math.trunc(Number(e.target.value) || 0))))}
                className="h-9 w-16 rounded-xl border border-ink/12 px-2 text-center font-semibold outline-none focus:ring-4 focus:ring-brand/25"
                aria-label={t("prepCustom")}
              />
              min
            </label>
          </div>
        </fieldset>

        {product && (
          <section>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-ink/80">{t("photos")}</h3>
              <span className="text-xs text-ink/45">
                {product.images.length}/{limits.productImages}
              </span>
            </div>
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {product.images.map((image, index) => (
                <li key={image.fileId} className="group relative aspect-square overflow-hidden rounded-2xl bg-surface">
                  {image.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt="" className="size-full object-cover" />
                  )}
                  {index === 0 ? (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                      <Star className="size-3 fill-ink" aria-hidden /> {t("mainPhoto")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void run(() => container.catalogAdmin.makeProductImagePrimary(product.id, image.fileId))}
                      className="absolute left-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-white/90 text-ink/60 shadow hover:text-ink"
                      aria-label={t("makeMain")}
                      title={t("makeMain")}
                    >
                      <Star className="size-3.5" aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void run(() => container.catalogAdmin.removeProductImage(product.id, image.fileId))}
                    className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-ink/80 text-white shadow"
                    aria-label={t("removePhoto")}
                    title={t("removePhoto")}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
              {product.images.length < limits.productImages && (
                <li className="aspect-square">
                  <ImageUploadButton
                    purpose="PRODUCT_IMAGE"
                    label={t("addPhoto")}
                    onUploaded={(fileId) => run(() => container.catalogAdmin.addProductImage(product.id, fileId))}
                    onError={setError}
                    className="size-full rounded-2xl border-2 border-dashed border-ink/15 text-ink/40 hover:border-ink/35 hover:text-ink/70"
                  />
                </li>
              )}
            </ul>
            <p className="mt-1.5 text-xs text-ink/45">{t("photosHint")}</p>
          </section>
        )}

        {product && <VersionHistory productId={product.id} currentVersionId={product.versionId} />}

        {error ? <Alert>{errorMessage(error)}</Alert> : null}

        <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-col gap-2 border-t border-ink/5 bg-white px-6 py-4">
          <Button type="submit" size="lg" block loading={busy} disabled={!valid}>
            {product ? t("saveProduct") : t("createProduct")}
          </Button>
          {product &&
            (confirmDiscontinue ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-800">
                <p>{t("discontinueBody")}</p>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" loading={busy} onClick={() => void discontinue()}>
                    {t("discontinueConfirm")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDiscontinue(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" block onClick={() => setConfirmDiscontinue(true)}>
                <Ban className="size-4" aria-hidden /> {t("discontinue")}
              </Button>
            ))}
        </div>
      </form>
    </Dialog>
  );
}

/** Versiones del producto, de la más reciente a la más antigua (product_versions es inmutable). */
function VersionHistory({ productId, currentVersionId }: { productId: string; currentVersionId: string }) {
  const t = useTranslations("menuEditor");
  const format = useFormatter();
  const money = useCatalogFormat();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<ProductVersion[] | null>(null);

  useEffect(() => {
    setVersions(null);
  }, [currentVersionId]);

  useEffect(() => {
    if (!open || versions) return;
    container.catalogAdmin.productVersions(productId).then(setVersions, () => setVersions([]));
  }, [open, versions, productId]);

  return (
    <section className="rounded-2xl ring-1 ring-ink/10">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold">
        <History className="size-4 text-ink/50" aria-hidden /> {t("history")}
        <ChevronDown className={`ml-auto size-4 text-ink/40 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            {!versions ? (
              <li className="px-4 pb-3 text-sm text-ink/45">…</li>
            ) : (
              versions.map((v, i) => (
                <li key={v.id} className="flex items-center gap-3 border-t border-dashed border-ink/10 px-4 py-2.5 text-sm">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${v.id === currentVersionId ? "bg-brand text-ink" : "bg-surface text-ink/50"}`}>
                    {versions.length - i}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{v.name}</span>
                    <span className="block text-xs text-ink/50">
                      {format.dateTime(new Date(v.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                      {v.createdBy ? ` · ${v.createdBy}` : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display font-extrabold tabular-nums">{money.price(v.price)}</span>
                    <span className="block text-xs text-ink/50">{t("minutes", { count: v.prepMinutes })}</span>
                  </span>
                </li>
              ))
            )}
          </motion.ol>
        )}
      </AnimatePresence>
    </section>
  );
}
