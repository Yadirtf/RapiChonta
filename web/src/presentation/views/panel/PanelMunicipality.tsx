"use client";

import { ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { can, PERMISSIONS, type Account } from "@/core/domain/entities/account";
import type { Municipality } from "@/core/domain/entities/business";
import { container } from "@/infrastructure/di/container";

const STORAGE_KEY = "rc_panel_municipality";

interface PanelMunicipalityValue {
  municipalities: Municipality[];
  /** Municipio sobre el que trabajan Zonas, Horario y Configuración. `undefined`: el del alcance de la API. */
  municipalityId: number | undefined;
  current: Municipality | null;
  select: (id: number) => void;
  /** Volver a pedir la lista (al abrir o pausar un municipio). */
  refresh: () => Promise<void>;
}

const PanelMunicipalityContext = createContext<PanelMunicipalityValue>({
  municipalities: [],
  municipalityId: undefined,
  current: null,
  select: () => {},
  refresh: async () => {},
});

/**
 * Municipio activo del panel (H03.5). El personal con alcance trabaja siempre en el suyo; el administrador
 * general elige y la elección se recuerda en el navegador. Por defecto, el primer municipio abierto.
 */
export function PanelMunicipalityProvider({ account, children }: { account: Account; children: ReactNode }) {
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const allowed = can(account, PERMISSIONS.MANAGE_ZONES);

  const refresh = useCallback(async () => {
    if (!allowed) return;
    try {
      setMunicipalities((await container.businessAdmin.options()).municipalities);
    } catch {
      setMunicipalities([]);
    }
  }, [allowed]);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      if (Number.isInteger(stored) && stored > 0) setSelected(stored);
    } catch {
      // Sin almacenamiento: se usa el predeterminado.
    }
    void refresh();
  }, [refresh]);

  const value = useMemo<PanelMunicipalityValue>(() => {
    const ordered = [...municipalities].sort((a, b) => Number(b.launched) - Number(a.launched) || a.name.localeCompare(b.name, "es"));
    const current = ordered.find((m) => m.id === selected) ?? ordered.find((m) => m.launched) ?? ordered[0] ?? null;
    return {
      municipalities: ordered,
      municipalityId: current?.id,
      current,
      refresh,
      select: (id: number) => {
        setSelected(id);
        try {
          window.localStorage.setItem(STORAGE_KEY, String(id));
        } catch {
          // Se recuerda solo mientras la página esté abierta.
        }
      },
    };
  }, [municipalities, selected, refresh]);

  return <PanelMunicipalityContext.Provider value={value}>{children}</PanelMunicipalityContext.Provider>;
}

export const usePanelMunicipality = () => useContext(PanelMunicipalityContext);

/**
 * Selector del menú lateral: una placa con el municipio y un punto verde si está abierto. Solo aparece
 * cuando hay más de un municipio para elegir.
 */
export function MunicipalitySwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("coverage");
  const { municipalities, current, select } = usePanelMunicipality();
  if (municipalities.length < 2 || !current) return null;
  return (
    <label className={`group relative flex items-center gap-2.5 rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-white/15 ${className}`}>
      <span className={`size-2.5 shrink-0 rounded-full ${current.launched ? "bg-leaf shadow-[0_0_0_3px_rgba(31,122,77,0.35)]" : "bg-brand/70"}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">{t("workingIn")}</span>
        <span className="block truncate text-sm font-extrabold text-white">{current.name}</span>
      </span>
      <ChevronsUpDown className="size-4 shrink-0 text-white/70" aria-hidden />
      <select
        aria-label={t("workingIn")}
        value={current.id}
        onChange={(e) => select(Number(e.target.value))}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        <optgroup label={t("groupOpen")}>
          {municipalities.filter((m) => m.launched).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </optgroup>
        <optgroup label={t("groupPreparing")}>
          {municipalities.filter((m) => !m.launched).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
