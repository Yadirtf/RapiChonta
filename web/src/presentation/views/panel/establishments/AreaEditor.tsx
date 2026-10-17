"use client";

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPinned, PenLine, Square, Store, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { LngLat } from "@/core/domain/entities/catalog-admin";
import type { GeoPoint } from "@/core/domain/entities/establishment";
import { areaProblem, midpoint, roundVertex, squareAround, squareMeters, type AreaLimits } from "@/core/domain/entities/geo-area";
import { createBrandMap } from "../../../components/map/mapStyle";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";

const LEAF = "#1f7a4d";
const DANGER = "#dc2626";
/** Mitad del lado de los cuadrados rápidos, en metros (tienda pequeña, mediana, supermercado). */
const QUICK_SQUARES = [8, 15, 30];

export interface AreaValue {
  location: GeoPoint | null;
  area: LngLat[];
}

type Mode = "point" | "draw" | "edit";

interface Props {
  value: AreaValue;
  fallbackCenter: GeoPoint;
  limits: AreaLimits;
  onChange: (value: AreaValue) => void;
}

/**
 * Editor del punto y el área del local (H02.1, RF-10): se ubica el local, se dibuja el polígono con
 * clics y se ajusta arrastrando vértices; los puntos intermedios agregan vértices y el doble clic los
 * quita. El área sirve para saber cuándo el domiciliario llegó (geocerca).
 */
export function AreaEditor({ value, fallbackCenter, limits, onChange }: Props) {
  const t = useTranslations("establishmentEditor.area");
  const format = useCatalogFormat();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>(value.location ? (value.area.length ? "edit" : "draw") : "point");
  const history = useRef<AreaValue[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const latest = useRef({ value, mode });
  latest.current = { value, mode };

  const commit = useCallback(
    (next: AreaValue) => {
      history.current = [...history.current.slice(-49), latest.current.value];
      setCanUndo(true);
      onChange(next);
    },
    [onChange],
  );

  const undo = () => {
    const previous = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (previous) onChange(previous);
  };

  // Mapa: se crea una vez.
  useEffect(() => {
    if (!container.current) return;
    const start = value.location ?? fallbackCenter;
    const map = createBrandMap({ container: container.current, center: [start.lng, start.lat], zoom: value.location ? 18 : 15, maxZoom: 20.5 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.doubleClickZoom.disable();
    map.on("load", () => {
      map.addSource("area", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "area-fill", type: "fill", source: "area", filter: ["==", "$type", "Polygon"], paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 } });
      map.addLayer({
        id: "area-line",
        type: "line",
        source: "area",
        paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-dasharray": ["case", ["==", ["get", "kind"], "path"], ["literal", [2, 1.5]], ["literal", [1, 0]]] },
      });
      if (value.area.length >= 3) {
        const bounds = value.area.reduce((b, v) => b.extend(v), new maplibregl.LngLatBounds(value.area[0], value.area[0]));
        map.fitBounds(bounds, { padding: 80, maxZoom: 19, duration: 0 });
      }
      setReady(true);
    });
    map.on("click", (event) => {
      const { mode: currentMode, value: current } = latest.current;
      const point = roundVertex([event.lngLat.lng, event.lngLat.lat]);
      if (currentMode === "point") {
        commit({ ...current, location: { lng: point[0], lat: point[1] } });
        setMode(current.area.length ? "edit" : "draw");
        // Para dibujar el área hace falta ver la cuadra de cerca.
        if (!current.area.length) map.easeTo({ center: event.lngLat, zoom: Math.max(map.getZoom(), 19) });
      } else if (currentMode === "draw" && current.area.length < limits.maxVertices) {
        commit({ ...current, area: [...current.area, point] });
      }
    });
    mapRef.current = map;
    return () => map.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = value.location ? areaProblem(value.area, value.location, limits) : null;
  const color = problem && problem !== "TOO_FEW_VERTICES" ? DANGER : LEAF;

  const paint = useCallback(
    (ring: LngLat[], drawing: boolean) => {
      const source = mapRef.current?.getSource("area") as GeoJSONSource | undefined;
      if (!source) return;
      const features: GeoJSON.Feature[] = [];
      if (ring.length >= 3) features.push({ type: "Feature", properties: { color, kind: "polygon" }, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } });
      if (drawing && ring.length >= 2) features.push({ type: "Feature", properties: { color, kind: "path" }, geometry: { type: "LineString", coordinates: ring } });
      source.setData({ type: "FeatureCollection", features });
    },
    [color],
  );

  // Polígono, vértices arrastrables, puntos intermedios y el local.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const drawing = mode === "draw";
    paint(value.area, drawing);
    const markers: Marker[] = [];
    const roots: ReturnType<typeof createRoot>[] = [];

    value.area.forEach((vertex, index) => {
      const el = document.createElement("div");
      el.className = "area-vertex";
      el.title = t("vertexHint");
      const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(vertex).addTo(map);
      marker.on("drag", () => {
        const { lng, lat } = marker.getLngLat();
        paint(value.area.map((v, i) => (i === index ? [lng, lat] : v)), drawing);
      });
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        commit({ ...value, area: value.area.map((v, i) => (i === index ? roundVertex([lng, lat]) : v)) });
      });
      // Los clics sobre un marcador también llegan al mapa: se detienen para no agregar un vértice encima.
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        if (drawing && index === 0 && value.area.length >= 3) setMode("edit");
      });
      el.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        commit({ ...value, area: value.area.filter((_, i) => i !== index) });
      });
      markers.push(marker);
    });

    if (!drawing && value.area.length >= 3 && value.area.length < limits.maxVertices) {
      value.area.forEach((vertex, index) => {
        const next = value.area[(index + 1) % value.area.length];
        const el = document.createElement("button");
        el.type = "button";
        el.className = "area-midpoint";
        el.title = t("midpointHint");
        el.setAttribute("aria-label", t("midpointHint"));
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          const area = [...value.area];
          area.splice(index + 1, 0, roundVertex(midpoint(vertex, next)));
          commit({ ...value, area });
        });
        markers.push(new maplibregl.Marker({ element: el }).setLngLat(midpoint(vertex, next)).addTo(map));
      });
    }

    if (value.location) {
      const el = document.createElement("div");
      el.className = "store-pin";
      el.title = t("storeHint");
      el.addEventListener("click", (event) => event.stopPropagation());
      const root = createRoot(el);
      root.render(<Store className="size-5" strokeWidth={2.4} aria-hidden />);
      roots.push(root);
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: "center" }).setLngLat([value.location.lng, value.location.lat]).addTo(map);
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        const [x, y] = roundVertex([lng, lat]);
        commit({ ...value, location: { lng: x, lat: y } });
      });
      markers.push(marker);
    }

    return () => {
      markers.forEach((m) => m.remove());
      queueMicrotask(() => roots.forEach((r) => r.unmount()));
    };
  }, [value, mode, ready, paint, commit, limits.maxVertices, t]);

  const quickSquare = (halfSide: number) => {
    const center = value.location ?? (mapRef.current ? { lng: mapRef.current.getCenter().lng, lat: mapRef.current.getCenter().lat } : fallbackCenter);
    commit({ location: center, area: squareAround(center, halfSide) });
    setMode("edit");
    mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom: halfSide > 20 ? 17.5 : 18.5 });
  };

  const startDrawing = () => {
    if (value.area.length) commit({ ...value, area: [] });
    setMode("draw");
  };

  const area = squareMeters(value.area);
  const hint = mode === "point" ? t("hintPoint") : mode === "draw" ? t("hintDraw") : t("hintEdit");

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-ink/5">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink/5 p-2">
        <ToolButton active={mode === "point"} onClick={() => setMode("point")} icon={<MapPinned className="size-4" />} label={t("placeStore")} />
        <ToolButton active={mode === "draw"} onClick={startDrawing} icon={<PenLine className="size-4" />} label={t("draw")} />
        {mode === "draw" && value.area.length >= 3 && (
          <button onClick={() => setMode("edit")} className="h-9 rounded-xl bg-leaf px-3 text-sm font-bold text-white">
            {t("finish")}
          </button>
        )}
        <div className="flex items-center gap-1 rounded-xl bg-surface p-1" role="group" aria-label={t("quickSquare")}>
          <Square className="mx-1 size-4 text-ink/50" aria-hidden />
          {QUICK_SQUARES.map((half) => (
            <button key={half} onClick={() => quickSquare(half)} className="h-7 rounded-lg px-2 text-xs font-bold text-ink/70 hover:bg-white hover:text-ink" title={t("quickSquare")}>
              {half * 2}×{half * 2} m
            </button>
          ))}
        </div>
        <button onClick={undo} disabled={!canUndo} className="ml-auto grid size-9 place-items-center rounded-xl text-ink/60 hover:bg-ink/5 disabled:opacity-30" aria-label={t("undo")} title={t("undo")}>
          <Undo2 className="size-4.5" aria-hidden />
        </button>
      </div>

      <div className="blueprint relative min-h-[360px] flex-1">
        {/* MapLibre le pone `position: relative` a su contenedor: el posicionamiento va en un envoltorio. */}
        <div className="absolute inset-0">
          <div ref={container} className="h-full w-full" />
        </div>
        <p className="pointer-events-none absolute left-3 top-3 max-w-[75%] rounded-xl bg-ink/85 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">{hint}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-ink/5 px-4 py-3 text-sm">
        <span>
          <span className="text-ink/50">{t("surface")} </span>
          <strong className="font-display text-base tabular-nums">{format.squareMeters(area)}</strong>
        </span>
        <span className="text-ink/50">{t("vertices", { count: value.area.length })}</span>
        <span className={`ml-auto font-semibold ${!value.location ? "text-ink/50" : problem ? "text-red-600" : "text-leaf"}`} role="status">
          {!value.location ? t("problems.NO_LOCATION") : problem ? t(`problems.${problem}`, { min: limits.minSquareMeters, max: limits.maxSquareMeters }) : t("valid")}
        </span>
      </div>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition ${active ? "bg-ink text-brand" : "text-ink/70 hover:bg-ink/5"}`}
    >
      {icon} {label}
    </button>
  );
}
