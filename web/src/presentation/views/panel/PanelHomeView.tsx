"use client";

import { ArrowRight, Bike, ClipboardList, Store, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { can, PERMISSIONS } from "@/core/domain/entities/account";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../auth/AuthProvider";
import { useResource } from "../../hooks/useResource";

/** Inicio del panel. Los pedidos llegan con E07; por ahora, accesos y pendientes de identidad. */
export function PanelHomeView() {
  const t = useTranslations("panelHome");
  const { account } = useAuth();
  const manageCouriers = can(account, PERMISSIONS.MANAGE_COURIERS);
  const pending = useResource(
    () => (manageCouriers ? container.admin.couriers({ status: "PENDING" }) : Promise.resolve([])),
    [manageCouriers],
  );
  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <header>
        <p className="text-sm font-semibold text-brand-strong">{t("greeting")}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{t("title", { name: account?.givenNames ?? "" })}</h1>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {manageCouriers && (
          <Link href="/panel/domiciliarios" className="group flex flex-col gap-6 rounded-[28px] bg-ink p-6 text-white shadow-lg transition hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-2xl bg-brand text-ink">
                <Bike className="size-5" aria-hidden />
              </span>
              <ArrowRight className="size-5 text-white/40 transition group-hover:translate-x-1 group-hover:text-brand" aria-hidden />
            </div>
            <div>
              <p className="text-4xl font-extrabold">{pending.loading ? "·" : pendingCount}</p>
              <p className="text-white/65">{t("pendingCouriers", { count: pendingCount })}</p>
            </div>
          </Link>
        )}
        {can(account, PERMISSIONS.MANAGE_ESTABLISHMENTS) && (
          <Link href="/panel/establecimientos" className="group flex flex-col overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-ink/5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="awning awning-sm h-6" aria-hidden />
            <div className="flex flex-1 flex-col gap-6 p-6 pt-5">
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-2xl bg-ink text-brand">
                  <Store className="size-5" aria-hidden />
                </span>
                <ArrowRight className="size-5 text-ink/30 transition group-hover:translate-x-1 group-hover:text-ink" aria-hidden />
              </div>
              <div>
                <p className="font-bold">{t("establishmentsTitle")}</p>
                <p className="text-sm text-ink/55">{t("establishmentsBody")}</p>
              </div>
            </div>
          </Link>
        )}
        {can(account, PERMISSIONS.MANAGE_STAFF) && (
          <Link href="/panel/personal" className="group flex flex-col gap-6 rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-ink/5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-2xl bg-surface">
                <Users className="size-5" aria-hidden />
              </span>
              <ArrowRight className="size-5 text-ink/30 transition group-hover:translate-x-1 group-hover:text-ink" aria-hidden />
            </div>
            <div>
              <p className="font-bold">{t("staffTitle")}</p>
              <p className="text-sm text-ink/55">{t("staffBody")}</p>
            </div>
          </Link>
        )}
        <div className="flex flex-col gap-6 rounded-[28px] border-2 border-dashed border-ink/10 p-6">
          <span className="grid size-11 place-items-center rounded-2xl bg-white text-ink/40">
            <ClipboardList className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-bold text-ink/70">{t("ordersTitle")}</p>
            <p className="text-sm text-ink/50">{t("ordersBody")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
