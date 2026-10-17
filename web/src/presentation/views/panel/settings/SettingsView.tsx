"use client";

import { motion } from "framer-motion";
import { Bike, Globe2, History, MapPin, Percent, RefreshCw, RotateCcw, ShieldCheck, ShoppingBasket } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { can, PERMISSIONS } from "@/core/domain/entities/account";
import { effectiveValue, type Commission, type ExchangeRate, type Setting } from "@/core/domain/entities/business";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../../auth/AuthProvider";
import { PageHeader } from "../../../components/panel/PageHeader";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";

/** Grupos del panel: por lo que vive cada persona del equipo, no por cómo se llaman las claves. */
const GROUPS: { id: string; icon: ReactNode; keys: string[] }[] = [
  { id: "orders", icon: <ShoppingBasket className="size-4.5" />, keys: ["orders.new_customer_max_cop", "offers.timeout_seconds", "adjustments.timeout_seconds"] },
  { id: "delivery", icon: <Bike className="size-4.5" />, keys: ["delivery.arriving_meters", "delivery.proof_after_seconds", "geofence.consecutive_readings", "preparation.recheck_seconds"] },
  { id: "security", icon: <ShieldCheck className="size-4.5" />, keys: ["otp.ttl_seconds", "otp.max_attempts", "otp.max_sends_per_hour", "location.retention_days", "security.auth_log_retention_days"] },
];

/** next-intl separa las claves por puntos: "otp.ttl_seconds" → "otp_ttl_seconds". */
const messageKey = (key: string) => key.replaceAll(".", "_");

/**
 * Parámetros del negocio (H03.3), comisión (RF-73) y tasas de cambio (H03.4). Cada valor muestra su
 * predeterminado, su rango y quién lo cambió por última vez; los cambios quedan en el historial.
 */
export function SettingsView() {
  const t = useTranslations("settings");
  const errorMessage = useErrorMessage();
  const { data, error, loading, setData } = useResource(() => container.businessAdmin.settings(), []);
  const [historyOf, setHistoryOf] = useState<Setting | null>(null);
  const { account } = useAuth();
  const canCommission = !!account && can(account, PERMISSIONS.MANAGE_COMMISSION);

  const grouped = useMemo(() => {
    const settings = data?.settings ?? [];
    const known = new Set(GROUPS.flatMap((g) => g.keys));
    const groups = GROUPS.map((g) => ({ ...g, settings: g.keys.map((k) => settings.find((s) => s.key === k)).filter((s): s is Setting => !!s) }));
    const others = settings.filter((s) => !known.has(s.key));
    return others.length ? [...groups, { id: "other", icon: <Globe2 className="size-4.5" />, keys: [], settings: others }] : groups;
  }, [data]);

  const replace = (next: Setting) => setData((d) => (d ? { ...d, settings: d.settings.map((s) => (s.key === next.key ? next : s)) } : d));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title={t("title")} subtitle={data ? t("subtitle", { municipality: data.municipality.name }) : undefined} />

      <div className={`grid gap-5 ${canCommission ? "lg:grid-cols-[1.15fr_1fr]" : ""}`}>
        {canCommission && <CommissionCard />}
        <ExchangeRatesCard />
      </div>

      {error ? <Alert>{errorMessage(error)}</Alert> : null}

      {loading && !data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-3xl bg-white" />
          ))}
        </div>
      ) : (
        data &&
        grouped.map(
          (group) =>
            group.settings.length > 0 && (
              <section key={group.id} aria-labelledby={`group-${group.id}`} className="flex flex-col gap-2">
                <h2 id={`group-${group.id}`} className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-widest text-ink/45">
                  <span className="text-chonta-strong" aria-hidden>
                    {group.icon}
                  </span>
                  {t(`groups.${group.id}`)}
                </h2>
                <ul className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-ink/5">
                  {group.settings.map((setting, i) => (
                    <SettingRow
                      key={setting.key}
                      setting={setting}
                      first={i === 0}
                      municipality={data.municipality.name}
                      canEditGlobal={data.canEditGlobal}
                      onSaved={replace}
                      onHistory={() => setHistoryOf(setting)}
                    />
                  ))}
                </ul>
              </section>
            ),
        )
      )}

      <SettingHistoryDialog setting={historyOf} onClose={() => setHistoryOf(null)} />
    </div>
  );
}

/** Valor en palabras: "180 s (3 min)", "$ 100.000", "80 m". */
function useSettingFormat() {
  const t = useTranslations("settings");
  const money = useCatalogFormat();
  const format = useFormatter();
  return (setting: Setting, value: string | null) => {
    if (value === null || value === "") return "—";
    const n = Number(value);
    switch (setting.type) {
      case "MONEY_COP":
        return money.price(value);
      case "SECONDS":
        return n >= 60 ? t("units.secondsLong", { value: format.number(n), minutes: format.number(n / 60, { maximumFractionDigits: 1 }) }) : t("units.SECONDS", { value: format.number(n) });
      default:
        return t(`units.${setting.type}`, { value: setting.type === "DAYS" ? n : format.number(n) });
    }
  };
}

function SettingRow({
  setting,
  first,
  municipality,
  canEditGlobal,
  onSaved,
  onHistory,
}: {
  setting: Setting;
  first: boolean;
  municipality: string;
  canEditGlobal: boolean;
  onSaved: (s: Setting) => void;
  onHistory: () => void;
}) {
  const t = useTranslations("settings");
  const format = useFormatter();
  const describe = useSettingFormat();
  const errorMessage = useErrorMessage();
  const key = messageKey(setting.key);

  // Un operador con alcance solo cambia su municipio; el administrador elige.
  const initialScope = setting.scoped && (!!setting.municipal || !canEditGlobal) ? "MUNICIPALITY" : "GLOBAL";
  const [scope, setScope] = useState<"GLOBAL" | "MUNICIPALITY">(initialScope);
  const stored = scope === "MUNICIPALITY" ? (setting.municipal?.value ?? effectiveValue(setting)) : (setting.global?.value ?? setting.defaultValue);
  const [value, setValue] = useState(stored ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => setValue(stored ?? ""), [stored]);

  const numeric = /^\d+$/.test(value.trim());
  const outOfRange = numeric && ((setting.min !== null && Number(value) < Number(setting.min)) || (setting.max !== null && Number(value) > Number(setting.max)));
  const changed = value.trim() !== (stored ?? "");
  const canSave = numeric && !outOfRange && changed;
  const lastChange = scope === "MUNICIPALITY" ? setting.municipal : setting.global;
  const editable = scope === "MUNICIPALITY" || canEditGlobal;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await container.businessAdmin.changeSetting(setting.key, value.trim(), scope));
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={`flex flex-col gap-3 p-5 md:flex-row md:items-start md:gap-6 ${first ? "" : "border-t border-dashed border-ink/10"}`}>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{t(`keys.${key}.label`)}</p>
        <p className="mt-0.5 text-sm text-ink/60">{t(`keys.${key}.help`)}</p>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink/45">
          <span>{t("defaultValue", { value: describe(setting, setting.defaultValue) })}</span>
          {(setting.min !== null || setting.max !== null) && (
            <span>
              {setting.max !== null ? t("range", { min: describe(setting, setting.min ?? "0"), max: describe(setting, setting.max) }) : t("rangeMin", { min: describe(setting, setting.min) })}
            </span>
          )}
          {lastChange?.createdBy && <span>{t("changedBy", { name: lastChange.createdBy, date: format.dateTime(new Date(lastChange.createdAt), { dateStyle: "medium" }) })}</span>}
        </p>
        {setting.scoped && setting.municipal && scope === "GLOBAL" && <p className="mt-1 text-xs font-semibold text-chonta-strong">{t("overriddenHere", { municipality, value: describe(setting, setting.municipal.value) })}</p>}
      </div>

      <div className="flex w-full flex-col gap-2 md:w-72">
        {setting.scoped && canEditGlobal && (
          <div role="radiogroup" aria-label={t("scope")} className="grid grid-cols-2 rounded-xl bg-surface p-1 text-xs font-bold">
            {(["GLOBAL", "MUNICIPALITY"] as const).map((s) => (
              <button key={s} role="radio" aria-checked={scope === s} onClick={() => setScope(s)} className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 transition ${scope === s ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink"}`}>
                {s === "GLOBAL" ? <Globe2 className="size-3.5" aria-hidden /> : <MapPin className="size-3.5" aria-hidden />}
                {s === "GLOBAL" ? t("scopeGlobal") : municipality}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className={`flex h-11 min-w-0 flex-1 items-center rounded-2xl bg-white ring-1 transition focus-within:ring-2 ${outOfRange || (value && !numeric) ? "ring-red-500" : "ring-ink/15 focus-within:ring-chonta"}`}>
            <span className="sr-only">{t(`keys.${key}.label`)}</span>
            {setting.type === "MONEY_COP" && <span className="pl-3 text-sm font-bold text-ink/40">$</span>}
            <input
              inputMode="numeric"
              value={value}
              disabled={!editable}
              onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && canSave && void save()}
              className="w-full min-w-0 bg-transparent px-3 font-display text-lg font-extrabold tabular-nums outline-none disabled:text-ink/40"
            />
            <span className="pr-3 text-xs font-bold uppercase text-ink/40">{t(`unitShort.${setting.type}`)}</span>
          </label>
          {canSave ? (
            <Button loading={saving} onClick={() => void save()}>
              {t("save")}
            </Button>
          ) : (
            <>
              <button
                onClick={() => setValue(setting.defaultValue ?? "")}
                disabled={!editable || value === setting.defaultValue}
                className="grid size-11 place-items-center rounded-2xl text-ink/45 hover:bg-ink/5 hover:text-ink disabled:opacity-30"
                aria-label={t("resetDefault")}
                title={t("resetDefault")}
              >
                <RotateCcw className="size-4" aria-hidden />
              </button>
              <button onClick={onHistory} className="grid size-11 place-items-center rounded-2xl text-ink/45 hover:bg-ink/5 hover:text-ink" aria-label={t("history")} title={t("history")}>
                <History className="size-4" aria-hidden />
              </button>
            </>
          )}
        </div>
        {numeric && value && <p className="text-right text-xs font-semibold text-ink/50">{describe(setting, value)}</p>}
        {outOfRange && <p className="text-xs font-semibold text-red-600">{t("outOfRange")}</p>}
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
      </div>
    </li>
  );
}

function SettingHistoryDialog({ setting, onClose }: { setting: Setting | null; onClose: () => void }) {
  const t = useTranslations("settings");
  const format = useFormatter();
  const describe = useSettingFormat();
  const { data, loading } = useResource(() => (setting ? container.businessAdmin.settingHistory(setting.key) : Promise.resolve([])), [setting?.key]);
  return (
    <Dialog open={!!setting} onClose={onClose} title={t("history")} description={setting ? t(`keys.${messageKey(setting.key)}.label`) : undefined} closeLabel={t("close")}>
      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-ink/5" />
      ) : !data?.length ? (
        <p className="text-sm text-ink/55">{t("noHistory")}</p>
      ) : (
        <ol className="flex flex-col gap-4 border-l-2 border-dashed border-ink/15 pl-5">
          {data.map((change, i) => (
            <li key={`${change.createdAt}-${change.municipalityId}`} className="relative">
              <span className={`absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-white ${i === 0 ? "bg-leaf" : "bg-ink/25"}`} aria-hidden />
              <p className="font-display text-lg font-extrabold tabular-nums">{setting ? describe(setting, change.value) : change.value}</p>
              <p className="text-xs text-ink/55">
                {format.dateTime(new Date(change.createdAt), { dateStyle: "medium", timeStyle: "short" })} · {change.createdBy ?? t("system")} · {change.municipalityId === null ? t("scopeGlobal") : t("scopeLocal")}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

/**
 * Comisión de RapiChonta sobre los productos (RF-73), como la pizarra del mostrador. Cambiarla solo
 * afecta los pedidos nuevos: cada pedido guarda la tasa con la que se creó.
 */
function CommissionCard() {
  const t = useTranslations("settings");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const { data, error, setData } = useResource(() => container.businessAdmin.commission(), []);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [showHistory, setShowHistory] = useState(false);
  const current = data?.current?.percent ?? null;

  useEffect(() => setValue(current ? trimPercent(current) : ""), [current]);

  const parsed = parsePercent(value);
  const canSave = parsed !== null && parsed !== (current ? trimPercent(current) : null);
  const save = async () => {
    if (parsed === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      setData(await container.businessAdmin.changeCommission(parsed));
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="commission-title" className="chalkboard relative overflow-hidden rounded-[28px] p-6 text-white shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand/80">{t("commissionKicker")}</p>
          <h2 id="commission-title" className="mt-1 font-display text-2xl font-extrabold tracking-tight">
            {t("commissionTitle")}
          </h2>
        </div>
        {data && data.history.length > 0 && (
          <button onClick={() => setShowHistory(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white">
            <History className="size-4" aria-hidden /> {t("history")}
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className={`flex h-20 items-center gap-1 rounded-3xl border-2 border-dashed px-4 transition focus-within:border-brand ${value && parsed === null ? "border-chonta" : "border-white/25"}`}>
          <span className="sr-only">{t("commissionTitle")}</span>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && canSave && void save()}
            placeholder="0"
            className="w-28 bg-transparent text-right font-display text-5xl font-extrabold tabular-nums text-brand outline-none placeholder:text-white/20"
          />
          <Percent className="size-8 text-brand/70" aria-hidden />
        </label>
        <Button size="lg" disabled={!canSave} loading={saving} onClick={() => void save()}>
          {t("saveCommission")}
        </Button>
      </div>
      {value && parsed === null && <p className="mt-2 text-xs font-semibold text-chonta-soft">{t("commissionInvalid")}</p>}
      <p className="mt-3 text-sm text-white/65">{t("commissionHelp")}</p>
      {data?.current && (
        <p className="mt-2 text-xs text-white/45">{t("changedBy", { name: data.current.by ?? t("system"), date: format.dateTime(new Date(data.current.since), { dateStyle: "medium", timeStyle: "short" }) })}</p>
      )}
      {error || saveError ? (
        <div className="mt-3">
          <Alert>{errorMessage(saveError ?? error)}</Alert>
        </div>
      ) : null}

      <CommissionHistory commission={data} open={showHistory} onClose={() => setShowHistory(false)} />
    </section>
  );
}

/** "12,5" → "12.5"; null si no es un porcentaje válido (0 a 99,99 con hasta 2 decimales). */
function parsePercent(text: string): string | null {
  const normal = text.trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(normal)) return null;
  return trimPercent(normal);
}
const trimPercent = (p: string) => (p.includes(".") ? p.replace(/0+$/, "").replace(/\.$/, "") : p);

function CommissionHistory({ commission, open, onClose }: { commission: Commission | null; open: boolean; onClose: () => void }) {
  const t = useTranslations("settings");
  const format = useFormatter();
  return (
    <Dialog open={open} onClose={onClose} title={t("commissionHistory")} description={t("commissionHistoryNote")} closeLabel={t("close")}>
      <ol className="flex flex-col gap-4 border-l-2 border-dashed border-ink/15 pl-5">
        {(commission?.history ?? []).map((c, i) => (
          <li key={c.since} className="relative">
            <span className={`absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-white ${i === 0 ? "bg-leaf" : "bg-ink/25"}`} aria-hidden />
            <p className="font-display text-lg font-extrabold tabular-nums">{format.number(Number(c.percent) / 100, { style: "percent", maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-ink/55">
              {format.dateTime(new Date(c.since), { dateStyle: "medium", timeStyle: "short" })} · {c.by ?? t("system")}
            </p>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

/** Tablero de la casa de cambio: cuántos pesos vale un dólar y un euro hoy (H03.4). */
function ExchangeRatesCard() {
  const t = useTranslations("settings");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const { data, error, loading, setData } = useResource(() => container.businessAdmin.exchangeRates(), []);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<unknown>(null);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      setData(await container.businessAdmin.refreshExchangeRates());
    } catch (e) {
      setRefreshError(e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section aria-labelledby="rates-title" className="flex flex-col rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-ink/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-leaf">{t("ratesKicker")}</p>
          <h2 id="rates-title" className="mt-1 font-display text-2xl font-extrabold tracking-tight">
            {t("ratesTitle")}
          </h2>
        </div>
        <Button size="sm" variant="outline" loading={refreshing} onClick={() => void refresh()}>
          {!refreshing && <RefreshCw className="size-4" aria-hidden />} {t("refresh")}
        </Button>
      </div>
      <div className="mt-4 grid flex-1 grid-cols-2 gap-3">
        {loading && !data
          ? [0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink/5" />)
          : (["USD", "EUR"] as const).map((currency) => <RateTile key={currency} currency={currency} rate={data?.find((r) => r.currency === currency)} />)}
      </div>
      <p className="mt-3 text-xs text-ink/50">{data?.length ? t("ratesHelp", { date: format.dateTime(new Date(data[0].fetchedAt), { dateStyle: "medium", timeStyle: "short" }) }) : t("ratesEmpty")}</p>
      {error || refreshError ? (
        <div className="mt-3">
          <Alert>{errorMessage(refreshError ?? error)}</Alert>
        </div>
      ) : null}
    </section>
  );
}

function RateTile({ currency, rate }: { currency: "USD" | "EUR"; rate: ExchangeRate | undefined }) {
  const t = useTranslations("settings");
  const money = useCatalogFormat();
  const format = useFormatter();
  return (
    <motion.div layout className="flex flex-col justify-between rounded-2xl bg-ink p-4 text-white">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-extrabold tracking-wider text-brand">{currency === "USD" ? "US$ 1" : "€ 1"}</span>
        {rate && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${rate.isToday ? "bg-leaf text-white" : "bg-chonta text-white"}`}>
            {rate.isToday ? t("today") : format.dateTime(new Date(rate.fetchedAt), { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
      <p className="mt-3 font-mono text-2xl font-bold tabular-nums tracking-tight text-[#ffe08a]">{rate ? money.price(Number(rate.copPerUnit).toFixed(2)) : "—"}</p>
    </motion.div>
  );
}
