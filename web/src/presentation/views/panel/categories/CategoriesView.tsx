"use client";

import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, Pencil, Plus, Tags } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { AdminCategory, CategoryInput } from "@/core/domain/entities/catalog-admin";
import { container } from "@/infrastructure/di/container";
import { CategoryIcon } from "../../../components/catalog/CategoryIcon";
import { EmptyState, PageHeader } from "../../../components/panel/PageHeader";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { useCatalogOptions } from "../../../hooks/useCatalogOptions";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";
import { CategoryDialog } from "./CategoryDialog";

/**
 * H02.4: categorías del mapa. El orden de esta lista es el del menú lateral del cliente; dar de baja
 * una categoría la saca del mapa sin borrar nada.
 */
export function CategoriesView() {
  const t = useTranslations("categoriesAdmin");
  const errorMessage = useErrorMessage();
  const list = useResource(() => container.catalogAdmin.categories(), []);
  const options = useCatalogOptions();
  const latest = useRef<AdminCategory[] | null>(null);
  latest.current = list.data;
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const [error, setError] = useState<unknown>(null);

  const attempt = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    }
    await list.reload();
  };

  const submit = async (input: CategoryInput) => {
    if (editing && editing !== "new") await container.catalogAdmin.updateCategory(editing.id, input);
    else await container.catalogAdmin.createCategory(input);
    setEditing(null);
    await list.reload();
  };

  const toggle = (c: AdminCategory) => {
    list.setData(latest.current!.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)));
    void attempt(() => container.catalogAdmin.setCategoryActive(c.id, !c.active));
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button size="lg" onClick={() => setEditing("new")} disabled={!options.data}>
            <Plus className="size-5" aria-hidden /> {t("new")}
          </Button>
        }
      />
      {error || list.error ? <Alert>{errorMessage(error ?? list.error)}</Alert> : null}

      {list.loading && !list.data ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : list.data?.length === 0 ? (
        <EmptyState icon={<Tags className="size-7" />} title={t("emptyTitle")} />
      ) : (
        list.data && (
          <Reorder.Group
            axis="y"
            values={list.data}
            onReorder={list.setData}
            className="flex flex-col gap-2"
          >
            {list.data.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                onEdit={() => setEditing(c)}
                onToggle={() => toggle(c)}
                onDragEnd={() => void attempt(() => container.catalogAdmin.reorderCategories(latest.current!.map((x) => x.id)))}
              />
            ))}
          </Reorder.Group>
        )
      )}
      <p className="text-sm text-ink/50">{t("orderHint")}</p>

      <CategoryDialog
        open={!!editing}
        category={editing === "new" ? null : editing}
        icons={options.data?.icons ?? []}
        onClose={() => setEditing(null)}
        onSubmit={submit}
      />
    </div>
  );
}

function CategoryRow({ category: c, onEdit, onToggle, onDragEnd }: { category: AdminCategory; onEdit: () => void; onToggle: () => void; onDragEnd: () => void }) {
  const t = useTranslations("categoriesAdmin");
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={c}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-ink/5 ${c.active ? "" : "opacity-60"}`}
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        className="grid size-9 cursor-grab touch-none place-items-center rounded-xl text-ink/30 hover:bg-ink/5 hover:text-ink active:cursor-grabbing"
        aria-label={t("drag")}
        title={t("drag")}
      >
        <GripVertical className="size-5" aria-hidden />
      </button>
      {/* Sticker con el ícono, como se ve en el menú lateral del cliente. */}
      <span className={`grid size-12 shrink-0 rotate-[-4deg] place-items-center rounded-2xl shadow-md ${c.active ? "bg-ink text-brand" : "bg-ink/20 text-ink/50"}`}>
        <CategoryIcon name={c.icon} className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">
          {c.names.es}
          {c.names.en && <span className="font-normal text-ink/45"> · {c.names.en}</span>}
        </p>
        <p className="flex items-center gap-2 text-xs text-ink/50">
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono">{c.code}</code>
          {t("establishments", { count: c.establishmentCount })}
        </p>
      </div>
      <button onClick={onEdit} className="grid size-9 place-items-center rounded-xl text-ink/45 hover:bg-ink/5 hover:text-ink" aria-label={t("edit")} title={t("edit")}>
        <Pencil className="size-4" aria-hidden />
      </button>
      <button
        role="switch"
        aria-checked={c.active}
        onClick={onToggle}
        aria-label={t("activeLabel", { name: c.names.es })}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${c.active ? "bg-leaf" : "bg-ink/15"}`}
      >
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${c.active ? "left-6" : "left-1"}`} aria-hidden />
      </button>
    </Reorder.Item>
  );
}
