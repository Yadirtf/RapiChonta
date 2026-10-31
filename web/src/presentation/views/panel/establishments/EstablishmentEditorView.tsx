"use client";

import { ArrowLeft, ClipboardList, ExternalLink, Handshake, MapPinned, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { can, PERMISSIONS } from "@/core/domain/entities/account";
import type { AdminEstablishment } from "@/core/domain/entities/catalog-admin";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../../auth/AuthProvider";
import { CategoryIcon } from "../../../components/catalog/CategoryIcon";
import { EstablishmentStatusSign, STATUS_LOOK } from "../../../components/catalog/EstablishmentStatus";
import { Alert } from "../../../components/ui/Alert";
import { useCatalogOptions } from "../../../hooks/useCatalogOptions";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";
import { MenuEditor } from "../menu/MenuEditor";
import { EstablishmentForm } from "./EstablishmentForm";
import { MapVisibilityNotice } from "./MapVisibilityNotice";
import { PartnershipPanel } from "./PartnershipPanel";
import { StatusControl } from "./StatusControl";

type Tab = "place" | "menu" | "partner";

/** H02.1 + H02.2: un local en pestañas, "Local y área" y "Menú" (y, para el administrador, "Comercio aliado", E15), con su estado arriba. */
export function EstablishmentEditorView({ id }: { id?: string }) {
  const t = useTranslations("establishmentEditor");
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const options = useCatalogOptions();
  const establishment = useResource<AdminEstablishment | null>(() => (id ? container.catalogAdmin.establishment(id) : Promise.resolve(null)), [id]);
  const [tab, setTab] = useState<Tab>("place");
  const { account } = useAuth();
  const managesPartners = can(account, PERMISSIONS.MANAGE_PARTNERS);

  // Recién creado, el local llega con #menu: el siguiente paso natural es cargar productos.
  useEffect(() => {
    if (window.location.hash === "#menu") setTab("menu");
  }, []);

  const data = establishment.data;
  const loadError = options.error ?? establishment.error;
  const icon = options.data?.categories.find((c) => c.code === data?.categories[0])?.icon;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <Link href="/panel/establecimientos" className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ink/60 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {t("back")}
      </Link>

      {loadError ? (
        <Alert>{errorMessage(loadError)}</Alert>
      ) : !options.data || (id && !data) ? (
        <div className="flex flex-col gap-4" aria-busy>
          <div className="h-28 animate-pulse rounded-[28px] bg-white" />
          <div className="h-[520px] animate-pulse rounded-[28px] bg-white" />
        </div>
      ) : (
        <>
          <header className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-ink/5">
            <div className={`awning awning-sm h-7 ${data ? STATUS_LOOK[data.status].awning : STATUS_LOOK.DRAFT.awning}`} aria-hidden />
            <div className="flex flex-col gap-4 p-5 pt-6 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pt-7">
              <div className="flex min-w-0 items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink text-brand">
                  {data?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.logoUrl} alt="" className="size-full object-cover" />
                  ) : data ? (
                    <CategoryIcon name={icon} className="size-7" />
                  ) : (
                    <Store className="size-7" aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <h1 className="truncate font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{data?.name ?? t("newTitle")}</h1>
                  <p className="text-sm text-ink/55">
                    {data ? (
                      <>
                        {data.municipality.name} · {t("productsSummary", { count: data.productCount, available: data.availableCount })}
                      </>
                    ) : (
                      t("newSubtitle")
                    )}
                  </p>
                </div>
                {data && (
                  <span className="sm:hidden">
                    <EstablishmentStatusSign status={data.status} />
                  </span>
                )}
              </div>
              {data && <StatusControl establishment={data} onChanged={(e) => establishment.setData(e)} />}
            </div>
            {data && (
              <nav className="flex items-center gap-1 border-t border-ink/5 px-3" role="tablist" aria-label={t("tabs")}>
                <TabButton active={tab === "place"} onClick={() => setTab("place")} icon={<MapPinned className="size-4" />} label={t("tabPlace")} />
                <TabButton active={tab === "menu"} onClick={() => setTab("menu")} icon={<ClipboardList className="size-4" />} label={t("tabMenu")} />
                {managesPartners && <TabButton active={tab === "partner"} onClick={() => setTab("partner")} icon={<Handshake className="size-4" />} label={t("tabPartner")} />}
                {data.status === "ACTIVE" && (
                  <Link href={`/local/${data.id}`} target="_blank" className="ml-auto inline-flex items-center gap-1.5 px-3 text-sm font-semibold text-ink/55 hover:text-ink">
                    {t("viewAsCustomer")} <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                )}
              </nav>
            )}
          </header>

          {data && <MapVisibilityNotice establishment={data} onOpenMenu={() => setTab("menu")} />}

          {tab === "place" || !data ? (
            <EstablishmentForm
              key={data?.id ?? "new"}
              initial={data}
              options={options.data}
              onSaved={(saved, created) => {
                if (created) router.replace(`/panel/establecimientos/${saved.id}#menu`);
                else establishment.setData(saved);
              }}
            />
          ) : tab === "partner" ? (
            <PartnershipPanel establishmentId={data.id} />
          ) : (
            <MenuEditor establishmentId={data.id} limits={options.data.limits} onChanged={() => void establishment.reload()} />
          )}
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative inline-flex h-12 items-center gap-2 px-4 text-sm font-bold transition ${active ? "text-ink" : "text-ink/50 hover:text-ink"}`}
    >
      {icon} {label}
      {active && <span className="absolute inset-x-3 bottom-0 h-1 rounded-t-full bg-brand" aria-hidden />}
    </button>
  );
}
