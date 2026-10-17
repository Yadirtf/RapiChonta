"use client";

import { useLocale, useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { approximate, DISPLAY_CURRENCIES, type BusinessStatus, type DisplayCurrency, type ExchangeRate } from "@/core/domain/entities/business";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../auth/AuthProvider";

const CURRENCY_KEY = "rc_display_currency";
/** El estado se vuelve a pedir cada 2 minutos y justo cuando abre o cierra. */
const STATUS_REFRESH_MS = 120_000;

interface BusinessContextValue {
  /** null mientras carga o si la API no respondió (en ese caso no se bloquea nada en la web). */
  status: BusinessStatus | null;
  rates: ExchangeRate[];
  displayCurrency: DisplayCurrency | null;
  setDisplayCurrency: (currency: DisplayCurrency | null) => void;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

/**
 * Estado de atención de RapiChonta (H03.2) y moneda del precio aproximado (H03.4). La moneda se guarda en
 * la cuenta si hay sesión y en el navegador si no; las tasas son públicas y se piden una vez.
 */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const { account, setAccount } = useAuth();
  const [status, setStatus] = useState<BusinessStatus | null>(null);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [localCurrency, setLocalCurrency] = useState<DisplayCurrency | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CURRENCY_KEY) as DisplayCurrency | null;
      if (stored && DISPLAY_CURRENCIES.includes(stored)) setLocalCurrency(stored);
    } catch {
      // Sin almacenamiento: solo pesos.
    }
    container.business.exchangeRates().then(setRates, () => setRates([]));
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await container.business.status();
        if (cancelled) return;
        setStatus(next);
        const edge = Date.parse(next.open ? (next.closesAt ?? "") : (next.nextOpeningAt ?? ""));
        const untilEdge = Number.isFinite(edge) ? edge - Date.now() + 1_000 : Infinity;
        timer = window.setTimeout(load, Math.max(5_000, Math.min(STATUS_REFRESH_MS, untilEdge)));
      } catch {
        if (!cancelled) timer = window.setTimeout(load, STATUS_REFRESH_MS);
      }
    };
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const displayCurrency = account ? account.displayCurrency : localCurrency;

  const setDisplayCurrency = useCallback(
    (currency: DisplayCurrency | null) => {
      setLocalCurrency(currency);
      try {
        if (currency) window.localStorage.setItem(CURRENCY_KEY, currency);
        else window.localStorage.removeItem(CURRENCY_KEY);
      } catch {
        // Navegación privada: queda en memoria.
      }
      if (account) {
        setAccount({ ...account, displayCurrency: currency });
        container.business.setDisplayCurrency(currency).then(setAccount, () => undefined);
      }
    },
    [account, setAccount],
  );

  const value = useMemo(() => ({ status, rates, displayCurrency, setDisplayCurrency }), [status, rates, displayCurrency, setDisplayCurrency]);
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness(): BusinessContextValue {
  const value = useContext(BusinessContext);
  if (!value) throw new Error("useBusiness fuera de BusinessProvider");
  return value;
}

/** "≈ US$ 6,10" junto a un precio en pesos; null si el cliente no eligió moneda o no hay tasa. */
export function useApproximate() {
  const { rates, displayCurrency } = useBusiness();
  const locale = useLocale();
  return useCallback(
    (cents: number) => {
      if (!displayCurrency) return null;
      const rate = rates.find((r) => r.currency === displayCurrency);
      const value = approximate(cents, rate);
      if (value === null || !rate) return null;
      const text = new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
        style: "currency",
        currency: displayCurrency,
        currencyDisplay: displayCurrency === "USD" ? "symbol" : "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
      return { text: `≈ ${text}`, rate };
    },
    [rates, displayCurrency, locale],
  );
}

/**
 * Frases del horario en la hora del municipio: "Abierto hasta las 10:00 p. m.", "Abrimos hoy a las 8:00 a. m.",
 * "Abrimos mañana…" o "Abrimos el lunes…".
 */
export function useOpeningText() {
  const t = useTranslations("business");
  const locale = useLocale();
  return useCallback(
    (status: BusinessStatus | null) => {
      if (!status) return null;
      const timeZone = status.municipality.timeZone;
      const tag = locale === "en" ? "en-US" : "es-CO";
      const time = (iso: string) => new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
      const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      if (status.open) return { tone: "open" as const, title: t("openNow"), detail: status.closesAt ? t("openUntil", { time: time(status.closesAt) }) : t("openNow") };
      if (!status.nextOpeningAt) return { tone: "closed" as const, title: t("closedNow"), detail: t("noSchedule") };
      const next = new Date(status.nextOpeningAt);
      const today = dayKey(new Date());
      const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
      const when = dayKey(next);
      const at = time(status.nextOpeningAt);
      const detail =
        when === today
          ? t("opensToday", { time: at })
          : when === tomorrow
            ? t("opensTomorrow", { time: at })
            : t("opensOn", { day: new Intl.DateTimeFormat(tag, { weekday: "long", timeZone }).format(next), time: at });
      return { tone: "closed" as const, title: t("closedNow"), detail };
    },
    [t, locale],
  );
}
