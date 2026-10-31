"use client";

import { motion } from "framer-motion";
import { Bell, BellOff, BookOpenText, ChevronDown, Loader2, LogOut, Store, UtensilsCrossed } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fullName, isMerchantSession } from "@/core/domain/entities/account";
import { MERCHANT_POLL_MS, type MerchantStore } from "@/core/domain/entities/merchant";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../auth/AuthProvider";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Logo, LogoMark } from "../../components/ui/Logo";
import { initials } from "../../format";
import { useDispatchBell } from "../../hooks/useDispatchBell";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { usePolling } from "../../hooks/usePolling";
import { useResource } from "../../hooks/useResource";
import { MenuEditor } from "../panel/menu/MenuEditor";
import { CounterBoard } from "./CounterBoard";
import { DoorSignToggle } from "./DoorSignToggle";

type Tab = "counter" | "menu";

/**
 * El portal del comercio aliado (H15.1). La fachada de su tienda: el toldo con su nombre, el aviso de puerta para
 * abrir o pausar, la campana de pedidos nuevos y dos puertas, el mostrador y la pizarra del menú. Entra con su número
 * y contraseña por el ingreso del personal; sin sesión de comercio vuelve allí.
 */
export function MerchantPortalView() {
  const { status, account } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/panel/ingresar?next=/comercio");
    else if (status === "authenticated" && !isMerchantSession(account)) router.replace("/panel");
  }, [status, account, router]);

  if (status !== "authenticated" || !isMerchantSession(account)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-cream" aria-busy>
        <Loader2 className="size-6 animate-spin text-ink/40" aria-hidden />
      </div>
    );
  }
  return <Storefront />;
}

function Storefront() {
  const t = useTranslations("merchant");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const params = useSearchParams();
  const { account, signOut } = useAuth();
  const bell = useDispatchBell("merchant");
  const stores = usePolling(() => container.merchant.stores(), [], MERCHANT_POLL_MS * 3);
  const options = useResource(() => container.merchant.options(), []);
  const list = useMemo(() => stores.data?.stores ?? [], [stores.data]);
  const store = list.find((s) => s.id === params.get("local")) ?? list[0] ?? null;
  const [tab, setTab] = useState<Tab>(params.get("vista") === "menu" ? "menu" : "counter");

  const go = (next: { local?: string; vista?: Tab }) => {
    const query = new URLSearchParams(params.toString());
    if (next.local) query.set("local", next.local);
    if (next.vista) {
      setTab(next.vista);
      if (next.vista === "menu") query.set("vista", "menu");
      else query.delete("vista");
    }
    router.replace(`/comercio?${query.toString()}`, { scroll: false });
  };

  const leave = () => void signOut().then(() => router.replace("/panel/ingresar?next=/comercio"));

  if (stores.loading && !stores.data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-cream" aria-busy>
        <Loader2 className="size-6 animate-spin text-ink/40" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="relative z-10 bg-white shadow-[0_1px_0_rgb(20_18_31/0.06)]">
        <div className="awning h-9" aria-hidden />
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-4 pt-7 sm:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <StoreBadge store={store} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-chonta-strong">{t("eyebrow")}</p>
              {list.length > 1 ? (
                <label className="relative mt-0.5 inline-flex max-w-full items-center">
                  <span className="sr-only">{t("pickStore")}</span>
                  <select
                    value={store?.id}
                    onChange={(e) => go({ local: e.target.value })}
                    className="max-w-full appearance-none truncate bg-transparent pr-7 font-display text-2xl font-extrabold tracking-tight outline-none sm:text-3xl"
                  >
                    {list.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.waiting ? ` (${s.waiting})` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 size-5 text-ink/50" aria-hidden />
                </label>
              ) : (
                <h1 className="truncate font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{store?.name ?? t("noStoreTitle")}</h1>
              )}
              {store && (
                <p className="text-sm text-ink/55">
                  {t("partnerSince", {
                    municipality: store.municipality.name,
                    date: new Date(`${store.partnership.startedOn}T12:00:00`),
                  })}
                </p>
              )}
            </div>
            {store && <DoorSignToggle store={store} onChanged={() => void stores.refresh()} />}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={bell.toggle}
                aria-pressed={bell.enabled}
                title={bell.enabled ? t("bellOn") : t("bellOff")}
                className={`grid size-11 place-items-center rounded-2xl transition-colors ${bell.enabled ? "bg-brand text-ink" : "bg-ink/5 text-ink/60 hover:bg-ink/10"}`}
              >
                {bell.enabled ? <Bell className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}
                <span className="sr-only">{bell.enabled ? t("bellOn") : t("bellOff")}</span>
              </button>
              <span className="hidden items-center gap-2 rounded-2xl bg-ink/5 py-1 pl-1 pr-3 sm:flex">
                <span className="grid size-9 place-items-center rounded-xl bg-ink text-xs font-extrabold text-brand">
                  {initials(account!.givenNames, account!.familyNames)}
                </span>
                <span className="max-w-36 truncate text-sm font-semibold">{fullName(account!)}</span>
              </span>
              <button
                type="button"
                onClick={leave}
                title={t("signOut")}
                className="grid size-11 place-items-center rounded-2xl text-ink/60 hover:bg-ink/5 hover:text-ink"
              >
                <LogOut className="size-5" aria-hidden />
                <span className="sr-only">{t("signOut")}</span>
              </button>
            </div>
          </div>

          {store && (
            <nav className="flex gap-2" aria-label={t("sections")}>
              {(
                [
                  {
                    key: "counter",
                    icon: UtensilsCrossed,
                    badge: store.waiting,
                  },
                  { key: "menu", icon: BookOpenText, badge: 0 },
                ] as const
              ).map(({ key, icon: Icon, badge }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => go({ vista: key })}
                  aria-current={tab === key ? "page" : undefined}
                  className="relative inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold text-ink/65 transition-colors hover:text-ink"
                >
                  {tab === key && (
                    <motion.span
                      layoutId="merchant-tab"
                      className="absolute inset-0 rounded-2xl bg-ink"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 34,
                      }}
                    />
                  )}
                  <Icon className={`relative size-4.5 ${tab === key ? "text-brand" : ""}`} aria-hidden />
                  <span className={`relative ${tab === key ? "text-white" : ""}`}>{t(`tabs.${key}`)}</span>
                  {badge > 0 && (
                    <span className="relative grid min-w-5 place-items-center rounded-full bg-chonta px-1.5 text-[11px] font-extrabold text-white">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8">
        {stores.error && !stores.data ? (
          <Alert>{errorMessage(stores.error)}</Alert>
        ) : !store ? (
          <NoStore onSignOut={leave} />
        ) : tab === "menu" ? (
          options.data ? (
            <MenuEditor establishmentId={store.id} limits={options.data.menuLimits} onChanged={() => void stores.refresh()} />
          ) : (
            <div className="chalkboard h-[480px] animate-pulse rounded-[28px]" aria-busy />
          )
        ) : (
          <CounterBoard store={store} options={options.data} bell={bell} />
        )}
      </main>

      <footer className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 pb-6 pt-2 text-xs text-ink/45 sm:px-8">
        <LogoMark className="size-5" /> {t("footer")}
      </footer>
    </div>
  );
}

function StoreBadge({ store }: { store: MerchantStore | null }) {
  return (
    <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[22px] bg-ink text-brand shadow-lg ring-4 ring-white">
      {store?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={store.logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <Store className="size-8" aria-hidden />
      )}
    </span>
  );
}

/** Sin convenio vigente (o sin acceso todavía): el portal está cerrado, no roto. */
function NoStore({ onSignOut }: { onSignOut: () => void }) {
  const t = useTranslations("merchant");
  return (
    <div className="chalkboard mx-auto mt-6 flex max-w-lg flex-col items-center gap-4 rounded-[28px] px-6 py-12 text-center text-white">
      <Logo />
      <h2 className="font-display text-2xl font-extrabold">{t("noStoreTitle")}</h2>
      <p className="max-w-sm text-white/70">{t("noStoreBody")}</p>
      <Button variant="primary" onClick={onSignOut}>
        {t("signOut")}
      </Button>
    </div>
  );
}
