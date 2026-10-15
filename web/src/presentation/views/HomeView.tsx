"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MapPin, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { CATEGORY_LABELS, type Establishment, type EstablishmentCategory } from "@/core/domain/entities/establishment";
import { SideMenu } from "../components/layout/SideMenu";
import { useGeolocation } from "../hooks/useGeolocation";
import { useNearbyEstablishments } from "../hooks/useNearbyEstablishments";

// MapLibre usa APIs del navegador: se carga solo en cliente.
const NearbyMap = dynamic(() => import("../components/map/NearbyMap").then((m) => m.NearbyMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface" />,
});

const formatDistance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

export function HomeView() {
  const [categories, setCategories] = useState<EstablishmentCategory[]>(["FAST_FOOD", "RESTAURANT"]);
  const [selected, setSelected] = useState<Establishment | null>(null);
  const { position, status } = useGeolocation();
  const { data, error, loading } = useNearbyEstablishments(position, categories, status !== "loading");

  const toggle = (c: EstablishmentCategory) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  const onSelect = useCallback((e: Establishment) => setSelected(e), []);

  return (
    <main className="flex h-dvh w-full overflow-hidden">
      <SideMenu active={categories} onToggle={toggle} />

      <section className="relative flex-1">
        <NearbyMap center={position} establishments={data} onSelect={onSelect} />

        <header className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm shadow-lg backdrop-blur">
            <MapPin className="size-4 text-brand-strong" />
            {status === "denied" ? "Activa tu ubicación para ver lo más cercano" : "Cerca de ti"}
            <span className="font-semibold">· {loading ? "buscando…" : `${data.length} lugares`}</span>
          </div>
        </header>

        {error && (
          <p role="alert" className="absolute left-1/2 top-20 -translate-x-1/2 rounded-xl bg-red-600 px-4 py-2 text-sm text-white shadow">
            {error}
          </p>
        )}

        <AnimatePresence>
          {selected && (
            <motion.article
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="absolute inset-x-4 bottom-4 mx-auto max-w-md rounded-3xl bg-white p-5 shadow-2xl"
            >
              <button onClick={() => setSelected(null)} aria-label="Cerrar" className="absolute right-4 top-4 text-ink/50">
                <X className="size-5" />
              </button>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-strong">
                {CATEGORY_LABELS[selected.category]} · {formatDistance(selected.distanceMeters)}
              </p>
              <h2 className="mt-1 text-xl font-bold text-ink">{selected.name}</h2>
              <p className="text-sm text-ink/60">{selected.address}</p>
              <button className="mt-4 w-full rounded-2xl bg-brand py-3 font-bold text-ink transition-transform active:scale-[0.98]">
                Pedir aquí
              </button>
              <p className="mt-2 text-center text-xs text-ink/50">Un domiciliario de RapiChonta hace la compra por ti.</p>
            </motion.article>
          )}
        </AnimatePresence>
      </section>
    </main>
  );
}
