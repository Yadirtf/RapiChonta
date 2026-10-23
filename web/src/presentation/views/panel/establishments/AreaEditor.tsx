"use client";

import type * as GeoJSON from "geojson";
import { maplibregl } from "@/presentation/components/map/maplibre";
import { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LoaderCircle, LocateFixed, MapPinned, PenLine, Square, Store, Undo2 } from "lucide-react";
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
const CHONTA = "#e4572e";
/** Mitad del lado de los cuadrados rápidos, en metros (tienda pequeña, mediana, supermercado). */
const QUICK_SQUARES = [8, 15, 30];

export interface AreaValue {
  location: GeoPoint | null;
  area: LngLat[];
}

type Mode = "point" | "draw" | "edit";

/** Dónde está quien registra el local: sirve cuando el administrador lo da de alta parado en la puerta. */
type Here = { status: "idle" | "locating" } | { status: "found"; point: GeoPoint; accuracy: number; placed?: boolean } | { status: "error"; reason: "denied" | "unavailable" };

/** Círculo de precisión del GPS como polígono (MapLibre no dibuja círculos en metros). */
function accuracyRing({ lng, lat }: GeoPoint, meters: number): LngLat[] {
  const dLat = meters / 111_320;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return Array.from({ length: 49 }, (_, i) => {
    const angle = (i / 48) * 2 * Math.PI;
    return [lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)];
  });
}

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
  const [here, setHere] = useState<Here>({ status: "idle" });
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
      // Debajo del área: la precisión del GPS no debe tapar el polígono que se está dibujando.
      map.addSource("here", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "here-accuracy", type: "fill", source: "here", paint: { "fill-color": CHONTA, "fill-opacity": 0.12 } });
      map.addLayer({ id: "here-accuracy-line", type: "line", source: "here", paint: { "line-color": CHONTA, "line-width": 1.5, "line-opacity": 0.5 } });
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

  // "Estás aquí": el punto pulsante y el círculo de precisión.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("here") as GeoJSONSource | undefined;
    if (here.status !== "found") {
      source?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    source?.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [accuracyRing(here.point, Math.max(here.accuracy, 3))] } });
    const el = document.createElement("div");
    el.className = "here-dot";
    el.title = t("here.dot");
    const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([here.point.lng, here.point.lat]).addTo(map);
    return () => {
      marker.remove();
    };
  }, [here, ready, t]);

  const locate = () => {
    if (!("geolocation" in navigator)) return setHere({ status: "error", reason: "unavailable" });
    setHere({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lng: coords.longitude, lat: coords.latitude };
        setHere({ status: "found", point, accuracy: coords.accuracy });
        mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: Math.max(mapRef.current.getZoom(), 18.5) });
      },
      (error) => setHere({ status: "error", reason: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  /** Pone el local donde está el administrador; si aún no hay área, sigue con el dibujo. */
  const placeHere = () => {
    if (here.status !== "found") return;
    const [lng, lat] = roundVertex([here.point.lng, here.point.lat]);
    commit({ ...value, location: { lng, lat } });
    setHere({ ...here, placed: true });
    setMode(value.area.length ? "edit" : "draw");
    mapRef.current?.easeTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 19) });
  };

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
        <HerePanel here={here} onLocate={locate} onPlace={placeHere} />
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

/**
 * "Mi ubicación": un botón tipo brújula abajo a la izquierda (los zooms van a la derecha). Al encontrar
 * la posición ofrece ubicar el local ahí mismo, con la precisión del GPS a la vista para decidir.
 */
function HerePanel({ here, onLocate, onPlace }: { here: Here; onLocate: () => void; onPlace: () => void }) {
  const t = useTranslations("establishmentEditor.area.here");
  const locating = here.status === "locating";
  // Con más de 40 m de error el punto puede caer en otra cuadra: se sugiere ajustarlo a mano.
  const rough = here.status === "found" && here.accuracy > 40;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 right-14 flex flex-col items-start gap-2 *:pointer-events-auto">
      {here.status === "found" && !here.placed && (
        <div className="here-card flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white py-2 pl-3 pr-2 shadow-lg ring-1 ring-ink/10" role="status">
          <span className="text-xs leading-tight">
            <strong className="block font-display text-sm text-ink">{t("found")}</strong>
            <span className={rough ? "font-semibold text-chonta-strong" : "text-ink/60"}>{t(rough ? "rough" : "accuracy", { meters: Math.round(here.accuracy) })}</span>
          </span>
          <button onClick={onPlace} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-bold text-brand hover:bg-ink/90">
            <Store className="size-4" aria-hidden /> {t("placeHere")}
          </button>
        </div>
      )}
      {here.status === "error" && (
        <p className="max-w-full rounded-xl bg-chonta-soft px-3 py-2 text-xs font-semibold text-chonta-strong shadow-lg ring-1 ring-chonta/30" role="alert">
          {t(here.reason)}
        </p>
      )}
      <button
        onClick={onLocate}
        disabled={locating}
        aria-busy={locating}
        className={`here-button inline-flex h-11 items-center gap-2 rounded-full pl-1.5 pr-4 text-sm font-bold shadow-lg transition ${here.status === "found" ? "bg-chonta text-white" : "bg-white text-ink ring-1 ring-ink/10 hover:ring-chonta/50"}`}
      >
        <span className={`grid size-8 place-items-center rounded-full ${here.status === "found" ? "bg-white/20" : "bg-ink text-brand"}`}>
          {locating ? <LoaderCircle className="size-4.5 animate-spin" aria-hidden /> : <LocateFixed className="size-4.5" strokeWidth={2.4} aria-hidden />}
        </span>
        {locating ? t("locating") : here.status === "found" ? t("again") : t("button")}
      </button>
    </div>
  );
}
