"use client";

import { AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { Archive, ChevronDown, CookingPot, GripVertical, ImageOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { AdminMenu, AdminProduct, AdminSection, CatalogOptions } from "@/core/domain/entities/catalog-admin";
import type { Translations } from "@/core/domain/entities/establishment";
import { container } from "@/infrastructure/di/container";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";
import { ProductDialog } from "./ProductDialog";
import { SectionDialog } from "./SectionDialog";

interface Props {
  establishmentId: string;
  options: CatalogOptions;
  /** Avisa que cambió el conteo de productos (el encabezado del local lo muestra). */
  onChanged: () => void;
}

type Editing = { productId?: string; sectionId?: string } | null;

/**
 * Pizarra del menú (H02.2): secciones y productos en el orden en que el cliente los verá, con arrastrar
 * para ordenar y un interruptor "Hay / Agotado" que se usa varias veces al día.
 */
export function MenuEditor({ establishmentId, options, onChanged }: Props) {
  const t = useTranslations("menuEditor");
  const errorMessage = useErrorMessage();
  const menu = useResource(() => container.catalogAdmin.menu(establishmentId), [establishmentId]);
  const latest = useRef<AdminMenu | null>(null);
  latest.current = menu.data;
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sectionDialog, setSectionDialog] = useState<{ section?: AdminSection } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [showDiscontinued, setShowDiscontinued] = useState(false);

  const refresh = async () => {
    await menu.reload();
    onChanged();
  };

  /** Ejecuta un cambio; si la API lo rechaza, muestra el motivo y vuelve a cargar la pizarra real. */
  const attempt = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
      await menu.reload();
    }
  };

  const setSections = (sections: AdminSection[]) => latest.current && menu.setData({ ...latest.current, sections });
  const saveSectionOrder = () => void attempt(() => container.catalogAdmin.reorderSections(establishmentId, latest.current!.sections.map((s) => s.id)));
  const setProducts = (sectionId: string, products: AdminProduct[]) =>
    latest.current && setSections(latest.current.sections.map((s) => (s.id === sectionId ? { ...s, products } : s)));
  const saveProductOrder = (sectionId: string) =>
    void attempt(() => container.catalogAdmin.reorderProducts(sectionId, latest.current!.sections.find((s) => s.id === sectionId)!.products.map((p) => p.id)));

  const toggleAvailability = (product: AdminProduct) => {
    const status = product.status === "AVAILABLE" ? "SOLD_OUT" : "AVAILABLE";
    setSections(latest.current!.sections.map((s) => ({ ...s, products: s.products.map((p) => (p.id === product.id ? { ...p, status } : p)) })));
    void attempt(async () => {
      await container.catalogAdmin.changeProductStatus(product.id, status);
      onChanged();
    });
  };

  const submitSection = async (names: Translations<string>) => {
    const section = sectionDialog?.section;
    if (section) await container.catalogAdmin.renameSection(section.id, names);
    else await container.catalogAdmin.createSection(establishmentId, names);
    setSectionDialog(null);
    await menu.reload();
  };

  const removeSection = (section: AdminSection) => void attempt(async () => {
    await container.catalogAdmin.removeSection(section.id);
    await menu.reload();
  });

  if (menu.loading && !menu.data) return <div className="chalkboard h-96 animate-pulse rounded-[28px]" aria-busy />;
  if (!menu.data) return <Alert>{errorMessage(menu.error)}</Alert>;

  const sections = menu.data.sections;
  const editingProduct = editing?.productId ? (sections.flatMap((s) => s.products).find((p) => p.id === editing.productId) ?? null) : null;
  const totalProducts = sections.reduce((n, s) => n + s.products.length, 0);

  return (
    <div className="chalkboard relative rounded-[28px] p-4 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">{t("eyebrow")}</p>
          <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight">{t("title")}</h2>
          <p className="mt-1 max-w-xl text-sm text-white/55">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => setSectionDialog({})}>
            <Plus className="size-4" aria-hidden /> {t("newSection")}
          </Button>
          {sections.length > 0 && (
            <Button onClick={() => setEditing({ sectionId: sections[0].id })}>
              <Plus className="size-4" aria-hidden /> {t("newProduct")}
            </Button>
          )}
        </div>
      </div>

      {error ? <Alert className="mt-5">{errorMessage(error)}</Alert> : null}
      {notice ? (
        <Alert tone="success" className="mt-5">
          {notice}
        </Alert>
      ) : null}

      {sections.length === 0 ? (
        <div className="mt-8 rounded-3xl border-2 border-dashed border-white/15 px-6 py-14 text-center">
          <p className="font-display text-xl font-extrabold">{t("emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-white/55">{t("emptyBody")}</p>
          <Button className="mt-5" onClick={() => setSectionDialog({})}>
            <Plus className="size-4" aria-hidden /> {t("firstSection")}
          </Button>
        </div>
      ) : (
        <Reorder.Group axis="y" values={sections} onReorder={setSections} className="mt-8 flex flex-col gap-6">
          {sections.map((section) => (
            <SectionBoard
              key={section.id}
              section={section}
              onDragEnd={saveSectionOrder}
              onRename={() => setSectionDialog({ section })}
              onRemove={() => removeSection(section)}
              onAdd={() => setEditing({ sectionId: section.id })}
              onEdit={(p) => setEditing({ productId: p.id })}
              onToggle={toggleAvailability}
              onReorder={(products) => setProducts(section.id, products)}
              onProductDragEnd={() => saveProductOrder(section.id)}
            />
          ))}
        </Reorder.Group>
      )}

      {totalProducts > 0 && menu.data.discontinued.length > 0 && (
        <div className="mt-8 border-t border-white/10 pt-5">
          <button onClick={() => setShowDiscontinued((s) => !s)} aria-expanded={showDiscontinued} className="flex items-center gap-2 text-sm font-semibold text-white/55 hover:text-white">
            <Archive className="size-4" aria-hidden /> {t("discontinued", { count: menu.data.discontinued.length })}
            <ChevronDown className={`size-4 transition ${showDiscontinued ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showDiscontinued && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {menu.data.discontinued.map((p) => (
                <li key={p.id} className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-white/50 line-through decoration-white/30">
                  {p.texts.es.name}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-white/35">{t("discontinuedHint")}</p>
        </div>
      )}

      <SectionDialog open={!!sectionDialog} initial={sectionDialog?.section?.names} onClose={() => setSectionDialog(null)} onSubmit={submitSection} />
      <ProductDialog
        open={!!editing}
        establishmentId={establishmentId}
        sections={sections}
        product={editingProduct}
        defaultSectionId={editing?.sectionId}
        limits={options.limits}
        onClose={() => setEditing(null)}
        onSaved={async (productId, { created, newVersion }) => {
          await refresh();
          setNotice(created ? t("createdNotice") : newVersion ? t("newVersionNotice") : t("savedNotice"));
          if (created) setEditing({ productId });
          else setEditing(null);
        }}
        onImagesChanged={() => menu.reload()}
      />
    </div>
  );
}

interface SectionBoardProps {
  section: AdminSection;
  onDragEnd: () => void;
  onRename: () => void;
  onRemove: () => void;
  onAdd: () => void;
  onEdit: (product: AdminProduct) => void;
  onToggle: (product: AdminProduct) => void;
  onReorder: (products: AdminProduct[]) => void;
  onProductDragEnd: () => void;
}

function SectionBoard({ section, onDragEnd, onRename, onRemove, onAdd, onEdit, onToggle, onReorder, onProductDragEnd }: SectionBoardProps) {
  const t = useTranslations("menuEditor");
  const controls = useDragControls();
  return (
    <Reorder.Item value={section} dragListener={false} dragControls={controls} onDragEnd={onDragEnd} className="rounded-3xl bg-white/[0.04] p-3 ring-1 ring-white/10 sm:p-4">
      <header className="flex items-center gap-2">
        <button
          onPointerDown={(e) => controls.start(e)}
          className="grid size-9 cursor-grab touch-none place-items-center rounded-xl text-white/35 hover:bg-white/10 hover:text-white active:cursor-grabbing"
          aria-label={t("dragSection")}
          title={t("dragSection")}
        >
          <GripVertical className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-xl font-extrabold">{section.names.es}</h3>
          {section.names.en && <p className="truncate text-xs text-white/40">{section.names.en}</p>}
        </div>
        <button onClick={onRename} className="grid size-9 place-items-center rounded-xl text-white/45 hover:bg-white/10 hover:text-white" aria-label={t("renameSection")} title={t("renameSection")}>
          <Pencil className="size-4" aria-hidden />
        </button>
        {section.products.length === 0 && (
          <button onClick={onRemove} className="grid size-9 place-items-center rounded-xl text-white/45 hover:bg-red-500/20 hover:text-red-200" aria-label={t("removeSection")} title={t("removeSection")}>
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </header>

      {section.products.length > 0 ? (
        <Reorder.Group axis="y" values={section.products} onReorder={onReorder} className="mt-3 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {section.products.map((product) => (
              <ProductRow key={product.id} product={product} onEdit={() => onEdit(product)} onToggle={() => onToggle(product)} onDragEnd={onProductDragEnd} />
            ))}
          </AnimatePresence>
        </Reorder.Group>
      ) : (
        <p className="mt-2 px-11 text-sm text-white/40">{t("emptySection")}</p>
      )}

      <button onClick={onAdd} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-2.5 text-sm font-semibold text-white/55 transition hover:border-brand/60 hover:text-brand">
        <Plus className="size-4" aria-hidden /> {t("addToSection", { section: section.names.es })}
      </button>
    </Reorder.Item>
  );
}

function ProductRow({ product, onEdit, onToggle, onDragEnd }: { product: AdminProduct; onEdit: () => void; onToggle: () => void; onDragEnd: () => void }) {
  const t = useTranslations("menuEditor");
  const money = useCatalogFormat();
  const controls = useDragControls();
  const available = product.status === "AVAILABLE";
  const image = product.images[0]?.url;

  return (
    <Reorder.Item
      value={product}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 rounded-2xl bg-white p-2 pr-3 text-ink shadow-sm sm:gap-3 ${available ? "" : "bg-white/80"}`}
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink/30 hover:bg-ink/5 hover:text-ink active:cursor-grabbing"
        aria-label={t("dragProduct")}
        title={t("dragProduct")}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={`grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface text-ink/25 ${available ? "" : "grayscale"}`}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="size-full object-cover" />
          ) : (
            <ImageOff className="size-5" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-bold ${available ? "" : "text-ink/45 line-through"}`}>{product.texts.es.name}</span>
          <span className="flex items-center gap-2 text-xs text-ink/50">
            <span className="font-display text-sm font-extrabold text-ink tabular-nums">{money.price(product.price)}</span>
            {product.prepMinutes > 0 && (
              <span className="inline-flex items-center gap-1">
                <CookingPot className="size-3" aria-hidden /> {t("minutes", { count: product.prepMinutes })}
              </span>
            )}
            {!product.texts.en && <span className="hidden rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800 sm:inline">{t("missingEnglish")}</span>}
          </span>
        </span>
      </button>
      <button
        role="switch"
        aria-checked={available}
        onClick={onToggle}
        aria-label={t("availability", { name: product.texts.es.name })}
        className={`relative flex h-8 w-[92px] shrink-0 items-center rounded-full p-1 text-[11px] font-extrabold uppercase tracking-wide transition-colors ${available ? "bg-leaf text-white" : "bg-ink/10 text-ink/55"}`}
      >
        <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-[left] ${available ? "left-[calc(100%-1.75rem)]" : "left-1"}`} aria-hidden />
        <span className={`w-full ${available ? "pr-7 text-left pl-1.5" : "pl-7 text-right pr-1.5"}`}>{available ? t("available") : t("soldOut")}</span>
      </button>
    </Reorder.Item>
  );
}
