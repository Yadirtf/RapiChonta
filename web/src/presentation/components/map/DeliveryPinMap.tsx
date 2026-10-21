"use client";

import { maplibregl } from "./maplibre";
import { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Home, Store } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { CoverageArea } from "@/core/domain/entities/business";
import type { GeoPoint } from "@/core/domain/entities/establishment";
import { paintCoverage } from "./coverageOverlay";
import { createBrandMap } from "./mapStyle";

interface Props {
  /** Punto al que el mapa vuela cuando cambia `focusKey` (mi ubicación, un lugar guardado). */
  focus: GeoPoint;
  focusKey: number;
  /** Se llama cuando el mapa deja de moverse, con el punto bajo el pin. */
  onPick: (point: GeoPoint) => void;
  /** Rótulo sobre el pin: tarifa de la zona o el aviso de fuera de cobertura. */
  label?: ReactNode;
  /** Ubicación del local, como referencia de qué tan lejos queda la entrega. */
  store?: GeoPoint;
  /** Cobertura (H03.5): el cliente ve hasta dónde llegamos antes de soltar el pin. */
  coverage?: CoverageArea[] | null;
  className?: string;
}

/**
 * Mapa de entrega (H04.2) con el pin fijo en el centro: el cliente arrastra el mapa hasta su puerta.
 * El pin "se levanta" mientras el mapa se mueve y cae al soltar, y solo entonces se cotiza la zona.
 */
export function DeliveryPinMap({ focus, focusKey, onPick, label, store, coverage, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onPickRef = useRef(onPick);
  const [moving, setMoving] = useState(false);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = createBrandMap({ container: containerRef.current, center: [focus.lng, focus.lat], zoom: 17, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("movestart", () => setMoving(true));
    map.on("moveend", () => {
      setMoving(false);
      const c = map.getCenter();
      onPickRef.current({ lat: c.lat, lng: c.lng });
    });
    mapRef.current = map;
    return () => map.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (map && coverage) paintCoverage(map, coverage);
  }, [coverage]);

  useEffect(() => {
    mapRef.current?.flyTo({ center: [focus.lng, focus.lat], zoom: 17, speed: 1.6 });
  }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !store) return;
    const element = document.createElement("div");
    element.className = "place-marker pointer-events-none";
    element.setAttribute("aria-hidden", "true");
    const root = createRoot(element);
    root.render(
      <span className="place-pin">
        <span>
          <Store className="size-[18px]" strokeWidth={2.4} />
        </span>
      </span>,
    );
    const marker = new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat([store.lng, store.lat]).addTo(map);
    return () => {
      marker.remove();
      queueMicrotask(() => root.unmount());
    };
  }, [store?.lat, store?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={containerRef} className="blueprint absolute inset-0" />
      {/* La sombra marca el punto exacto (centro del mapa); la punta de la gota cae sobre ella. */}
      <span className={`drop-pin-shadow pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${moving ? "is-lifted" : ""}`} aria-hidden />
      <div className="pointer-events-none absolute bottom-1/2 left-1/2 mb-3 flex -translate-x-1/2 flex-col items-center">
        {label && <div className={`mb-3 transition-opacity ${moving ? "opacity-0" : "opacity-100"}`}>{label}</div>}
        <span className={`drop-pin ${moving ? "is-lifted" : ""}`}>
          <Home className="size-5" strokeWidth={2.6} aria-hidden />
        </span>
      </div>
    </div>
  );
}
