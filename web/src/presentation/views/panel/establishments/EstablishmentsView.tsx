"use client";

import { MapPin, Plus, Search, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminEstablishmentSummary } from "@/core/domain/entities/catalog-admin";
import type { EstablishmentStatus } from "@/core/domain/entities/establishment";
import { container } from "@/infrastructure/di/container";
import { CategoryIcon } from "../../../components/catalog/CategoryIcon";
import { EstablishmentStatusSign, STATUS_LOOK } from "../../../components/catalog/EstablishmentStatus";
import { EmptyState, PageHeader } from "../../../components/panel/PageHeader";
import { Alert } from "../../../components/ui/Alert";
import { useCatalogOptions } from "../../../hooks/useCatalogOptions";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useDebounced, useResource } from "../../../hooks/useResource";

const FILTERS: (EstablishmentStatus | "ALL")[] = ["ALL", "ACTIVE", "DRAFT", "TEMPORARILY_CLOSED", "INACTIVE"];

/** H02.1: la "calle" de locales registrados, cada uno con su toldo del color de su estado. */
export function EstablishmentsView() {
  const t = useTranslations("establishments");
  const ts = useTranslations("establishmentStatus");
  const errorMessage = useErrorMessage();
  const [filter, setFilter] = useState<EstablishmentStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 300);
  const list = useResource(() => container.catalogAdmin.establishments({ status: filter === "ALL" ? undefined : filter, search: q || undefined }), [filter, q]);
  const options = useCatalogOptions();
  const icons = useMemo(() => new Map(options.data?.categories.map((c) => [c.code, c.icon])), [options.data]);
  const newButton = (
    <Link href="/panel/establecimientos/nuevo" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-brand px-5 font-bold text-ink transition hover:bg-[#ffcf55] active:scale-[0.98]">
      <Plus className="size-5" aria-hidden /> {t("new")}
    </Link>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} action={newButton} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t("search")}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-ink/40" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-12 w-full rounded-2xl border border-ink/10 bg-white pl-11 pr-4 text-[15px] outline-none transition focus:border-ink/40 focus:ring-4 focus:ring-brand/25"
          />
        </label>
        <div role="tablist" aria-label={t("filterLabel")} className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 ring-1 ring-ink/10">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition ${filter === f ? "bg-ink text-white" : "text-ink/60 hover:bg-ink/5 hover:text-ink"}`}
            >
              {f !== "ALL" && <span className={`size-2 rounded-full ${STATUS_LOOK[f].dot}`} aria-hidden />}
              {f === "ALL" ? t("all") : ts(f)}
            </button>
          ))}
        </div>
      </div>

      {list.error ? <Alert>{errorMessage(list.error)}</Alert> : null}

      {list.loading && !list.data ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-[26px] bg-white" />
          ))}
        </div>
      ) : list.data && list.data.length === 0 ? (
        <EmptyState
          icon={<Store className="size-7" />}
          title={q || filter !== "ALL" ? t("noResults") : t("emptyTitle")}
          body={q || filter !== "ALL" ? undefined : t("emptyBody")}
          action={!q && filter === "ALL" ? newButton : undefined}
        />
      ) : (
        <ul className={`grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3 transition-opacity ${list.loading ? "opacity-60" : ""}`}>
          {list.data?.map((e) => (
            <StoreFront key={e.id} establishment={e} icon={e.primaryCategory ? icons.get(e.primaryCategory) : undefined} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StoreFront({ establishment: e, icon }: { establishment: AdminEstablishmentSummary; icon?: string }) {
  const t = useTranslations("establishments");
  const availability = e.productCount ? e.availableCount / e.productCount : 0;
  return (
    <li>
      <Link
        href={`/panel/establecimientos/${e.id}`}
        className="group block overflow-hidden rounded-[26px] bg-white shadow-sm ring-1 ring-ink/5 transition hover:-translate-y-1 hover:shadow-xl"
      >
        <div className={`awning awning-sm h-9 ${STATUS_LOOK[e.status].awning}`} aria-hidden />
        <div className="relative p-5 pt-7">
          <div className="absolute right-4 top-4">
            <EstablishmentStatusSign status={e.status} />
          </div>
          <span className="grid size-14 place-items-center overflow-hidden rounded-2xl bg-ink text-brand shadow-md">
            {e.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <CategoryIcon name={icon} className="size-7" />
            )}
          </span>
          <h2 className="mt-3 truncate font-display text-xl font-extrabold tracking-tight group-hover:underline">{e.name}</h2>
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink/55">
            <MapPin className="size-3.5 shrink-0" aria-hidden /> {e.addressLine} · {e.municipality.name}
          </p>
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-xs font-semibold text-ink/60">
              <span>{t("products", { count: e.productCount })}</span>
              <span>{t("available", { count: e.availableCount })}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-leaf transition-[width]" style={{ width: `${Math.round(availability * 100)}%` }} />
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
