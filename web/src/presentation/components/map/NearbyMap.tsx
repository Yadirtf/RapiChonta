"use client";

import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CoverageArea } from "@/core/domain/entities/business";
import type { Establishment, GeoPoint } from "@/core/domain/entities/establishment";
import { CategoryIcon } from "../catalog/CategoryIcon";
import { paintCoverage } from "./coverageOverlay";
import { createBrandMap } from "./mapStyle";

interface Props {
  center: GeoPoint;
  establishments: Establishment[];
  selectedId?: string | null;
  onSelect?: (establishment: Establishment) => void;
  /** Hasta dónde llegan los domiciliarios: lo de afuera se ve más oscuro. */
  coverage?: CoverageArea[] | null;
}

interface PlaceMarker {
  id: string;
  marker: Marker;
  root: Root;
  element: HTMLButtonElement;
}

export function NearbyMap({ center, establishments, selectedId, onSelect, coverage }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<PlaceMarker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = createBrandMap({
      container: containerRef.current,
      center: [center.lng, center.lat],
      zoom: 15,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;
    return () => map.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (map && coverage) paintCoverage(map, coverage, { dim: 0.22 });
  }, [coverage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [center.lng, center.lat], zoom: 15, speed: 1.4 });
    const el = document.createElement("div");
    el.className = "user-pin";
    userMarkerRef.current?.remove();
    userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([center.lng, center.lat]).addTo(map);
  }, [center.lat, center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const previous = markersRef.current;
    markersRef.current = establishments.map((e) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = e.acceptsOrders ? "place-marker" : "place-marker is-closed";
      element.setAttribute("aria-label", e.name);
      element.title = e.name;
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelect?.(e);
      });
      // El ícono de la categoría es un componente de React dentro de un marcador de MapLibre.
      const root = createRoot(element);
      root.render(
        <span className="place-pin">
          <span>
            <CategoryIcon name={e.categoryIcon} className="size-[18px]" strokeWidth={2.4} />
          </span>
        </span>,
      );
      const marker = new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat([e.location.lng, e.location.lat]).addTo(map);
      return { id: e.id, marker, root, element };
    });
    // Desmontar fuera del render en curso evita la advertencia de React por desmontaje síncrono.
    queueMicrotask(() =>
      previous.forEach(({ marker, root }) => {
        marker.remove();
        root.unmount();
      }),
    );
  }, [establishments, onSelect]);

  useEffect(() => {
    markersRef.current.forEach(({ id, element }) => element.setAttribute("aria-pressed", String(id === selectedId)));
  }, [selectedId, establishments]);

  return <div ref={containerRef} className="h-full w-full" />;
}
