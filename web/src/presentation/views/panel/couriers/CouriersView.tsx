"use client";

import { Bike, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CourierDetail, CourierSummary, CourierVerificationCode } from "@/core/domain/entities/staff";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../../auth/AuthProvider";
import { EmptyState, PageHeader } from "../../../components/panel/PageHeader";
import { AccountStatusBadge, VerificationBadge } from "../../../components/panel/StatusBadges";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { formatPhone, initials } from "../../../format";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useDebounced, useResource } from "../../../hooks/useResource";
import { CourierDetailDialog } from "./CourierDetailDialog";
import { CreateCourierDialog } from "./CreateCourierDialog";

const FILTERS: (CourierVerificationCode | "ALL")[] = ["ALL", "PENDING", "VERIFIED", "SUSPENDED", "REJECTED"];

/** H01.3: domiciliarios del administrador. */
export function CouriersView() {
  const t = useTranslations("couriers");
  const tc = useTranslations("catalog");
  const errorMessage = useErrorMessage();
  const { account } = useAuth();
  const [filter, setFilter] = useState<CourierVerificationCode | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 300);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<{ id: string; justCreated?: boolean } | null>(null);

  const list = useResource(() => container.admin.couriers({ status: filter === "ALL" ? undefined : filter, q: q || undefined }), [filter, q]);
  const options = useResource(() => container.admin.options(), []);
  const detail = useResource<CourierDetail | null>(() => (selected ? container.admin.courier(selected.id) : Promise.resolve(null)), [selected?.id]);

  const onChanged = (courier: CourierDetail) => {
    detail.setData(courier);
    void list.reload();
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus className="size-5" aria-hidden /> {t("new")}
          </Button>
        }
      />

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
              className={`h-10 shrink-0 rounded-xl px-3.5 text-sm font-semibold transition ${filter === f ? "bg-ink text-white" : "text-ink/60 hover:bg-ink/5 hover:text-ink"}`}
            >
              {f === "ALL" ? t("all") : t(`filters.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {list.error ? <Alert>{errorMessage(list.error)}</Alert> : null}

      {list.loading && !list.data ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : list.data && list.data.length === 0 ? (
        <EmptyState
          icon={<Bike className="size-7" />}
          title={q || filter !== "ALL" ? t("noResults") : t("emptyTitle")}
          body={q || filter !== "ALL" ? undefined : t("emptyBody")}
          action={
            !q && filter === "ALL" ? (
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden /> {t("new")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className={`flex flex-col gap-2 transition-opacity ${list.loading ? "opacity-60" : ""}`}>
          {list.data?.map((c) => (
            <CourierRow key={c.userId} courier={c} onOpen={() => setSelected({ id: c.userId })} vehicleLabel={c.vehicle ? tc(`vehicleTypes.${c.vehicle.type}`) : null} />
          ))}
        </ul>
      )}

      <CreateCourierDialog
        open={creating}
        options={options.data}
        onClose={() => setCreating(false)}
        onCreated={(courier) => {
          setCreating(false);
          detail.setData(courier);
          setSelected({ id: courier.userId, justCreated: true });
          void list.reload();
        }}
      />
      {account && (
        <CourierDetailDialog
          courier={selected ? detail.data : null}
          loading={!!selected && detail.loading}
          error={selected ? detail.error : null}
          viewer={account}
          justCreated={selected?.justCreated}
          municipalities={options.data?.municipalities}
          onClose={() => setSelected(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function CourierRow({ courier, onOpen, vehicleLabel }: { courier: CourierSummary; onOpen: () => void; vehicleLabel: string | null }) {
  return (
    <li>
      <button
        onClick={onOpen}
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-ink/5 transition hover:shadow-md hover:ring-ink/15 md:grid-cols-[auto_1.4fr_1fr_1fr_auto]"
      >
        <span className="grid size-11 place-items-center rounded-xl bg-surface font-extrabold text-ink/70">{initials(courier.givenNames, courier.familyNames)}</span>
        <span className="min-w-0">
          <span className="block truncate font-bold">{[courier.givenNames, courier.familyNames].filter(Boolean).join(" ")}</span>
          <span className="block text-sm text-ink/55">{formatPhone(courier.phone)}</span>
        </span>
        <span className="hidden text-sm md:block">
          <span className="block text-ink/80">{vehicleLabel ?? "—"}</span>
          {courier.vehicle?.plate && <span className="font-mono text-xs text-ink/50">{courier.vehicle.plate}</span>}
        </span>
        <span className="hidden text-sm text-ink/60 md:block">{courier.municipality?.name ?? "—"}</span>
        <span className="flex flex-col items-end gap-1.5">
          <VerificationBadge status={courier.verificationStatus} />
          {courier.accountStatus !== "ACTIVE" && <AccountStatusBadge status={courier.accountStatus} />}
        </span>
      </button>
    </li>
  );
}
