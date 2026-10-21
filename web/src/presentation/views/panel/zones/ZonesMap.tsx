"use client";

import type * as GeoJSON from "geojson";
import { maplibregl } from "@/presentation/components/map/maplibre";
import { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Zone } from "@/core/domain/entities/business";
import type { LngLat } from "@/core/domain/entities/catalog-admin";
import type { GeoPoint } from "@/core/domain/entities/establishment";
import { midpoint, roundVertex } from "@/core/domain/entities/geo-area";
import { boundsOf, labelPoint } from "@/core/domain/entities/zone-geometry";
import { createBrandMap } from "../../../components/map/mapStyle";

export type ZoneMapMode = "view" | "draw" | "edit" | "probe";

/** Paleta de las zonas: barrios en amarillo marca con borde chontaduro; veredas en verde palma. */
const COLORS = {
  URBAN: { fill: "#ffc531", line: "#b83a1b" },
  RURAL: { fill: "#1f7a4d", line: "#1f7a4d" },
  conflict: "#e4572e",
  coverage: "#b83a1b",
  draft: "#14121f",
  preview: "#1f7a4d",
} as const;

interface Props {
  fallbackCenter: GeoPoint;
  zones: Zone[];
  /** Cobertura del municipio (se edita en la página Cobertura): borde punteado como referencia. */
  coverage?: { area: LngLat[] } | null;
  selectedId: string | null;
  /** Zona que se está editando: no se pinta con las demás. */
  editingId: string | null;
  draft: LngLat[] | null;
  mode: ZoneMapMode;
  conflicts: string[];
  preview: LngLat[] | null;
  probe: GeoPoint | null;
  maxVertices: number;
  formatFee: (fee: string) => string;
  onSelect: (id: string) => void;
  onDraftChange: (ring: LngLat[]) => void;
  onCloseRing: () => void;
  onProbe: (point: GeoPoint) => void;
  labels: { vertexHint: string; midpointHint: string };
}

/**
 * Mapa de zonas de entrega (H03.1): todas las zonas activas con su nombre y tarifa, la que se está dibujando
 * con vértices arrastrables, las que chocan con ella en rojo y, si se pidió recortar, cómo quedaría.
 */
export function ZonesMap(props: Props) {
  const { fallbackCenter, zones, coverage = null, selectedId, editingId, draft, mode, conflicts, preview, probe, maxVertices, formatFee, onSelect, onDraftChange, onCloseRing, onProbe, labels } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ mode, draft, onDraftChange, onProbe, onSelect, maxVertices });
  latest.current = { mode, draft, onDraftChange, onProbe, onSelect, maxVertices };
  const fitted = useRef(false);

  useEffect(() => {
    if (!container.current) return;
    const map = createBrandMap({ container: container.current, center: [fallbackCenter.lng, fallbackCenter.lat], zoom: 14, maxZoom: 19.5 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.doubleClickZoom.disable();
    map.on("load", () => {
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      for (const id of ["coverage", "zones", "draft", "preview"]) map.addSource(id, { type: "geojson", data: empty });
      map.addLayer({ id: "coverage-fill", type: "fill", source: "coverage", paint: { "fill-color": COLORS.coverage, "fill-opacity": 0.06 } });
      map.addLayer({ id: "coverage-line", type: "line", source: "coverage", paint: { "line-color": COLORS.coverage, "line-width": 2.5, "line-dasharray": [3, 2] } });
      map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": ["get", "fill"], "fill-opacity": ["case", ["get", "conflict"], 0.45, ["get", "selected"], 0.42, 0.24] } });
      map.addLayer({
        id: "zones-line",
        type: "line",
        source: "zones",
        paint: { "line-color": ["get", "line"], "line-width": ["case", ["any", ["get", "selected"], ["get", "conflict"]], 3.5, 2], "line-opacity": 0.9 },
      });
      map.addLayer({ id: "preview-fill", type: "fill", source: "preview", paint: { "fill-color": COLORS.preview, "fill-opacity": 0.22 } });
      map.addLayer({ id: "preview-line", type: "line", source: "preview", paint: { "line-color": COLORS.preview, "line-width": 3, "line-dasharray": [1.5, 1] } });
      map.addLayer({ id: "draft-fill", type: "fill", source: "draft", filter: ["==", "$type", "Polygon"], paint: { "fill-color": COLORS.draft, "fill-opacity": 0.12 } });
      map.addLayer({ id: "draft-line", type: "line", source: "draft", paint: { "line-color": COLORS.draft, "line-width": 2.5, "line-dasharray": [2, 1.2] } });
      setReady(true);
    });
    map.on("click", "zones-fill", (event) => {
      if (latest.current.mode !== "view") return;
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") latest.current.onSelect(id);
    });
    map.on("mousemove", "zones-fill", () => {
      if (latest.current.mode === "view") map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "zones-fill", () => (map.getCanvas().style.cursor = ""));
    map.on("click", (event) => {
      const { mode: current, draft: ring, maxVertices: max } = latest.current;
      const point = roundVertex([event.lngLat.lng, event.lngLat.lat]);
      if (current === "probe") latest.current.onProbe({ lng: point[0], lat: point[1] });
      else if (current === "draw" && ring && ring.length < max) latest.current.onDraftChange([...ring, point]);
    });
    mapRef.current = map;
    return () => map.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = mode === "draw" || mode === "probe" ? "crosshair" : "";
  }, [mode, ready]);

  // Zonas guardadas y sus etiquetas (nombre + tarifa como una etiqueta de precio).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const visible = zones.filter((z) => z.id !== editingId);
    (map.getSource("zones") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: visible.map((z) => ({
        type: "Feature",
        properties: {
          id: z.id,
          fill: conflicts.includes(z.id) ? COLORS.conflict : COLORS[z.kind].fill,
          line: conflicts.includes(z.id) ? COLORS.conflict : COLORS[z.kind].line,
          selected: z.id === selectedId,
          conflict: conflicts.includes(z.id),
        },
        geometry: { type: "Polygon", coordinates: [[...z.area, z.area[0]]] },
      })),
    });
    const markers: Marker[] = visible.map((z) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `zone-label ${z.kind === "RURAL" ? "is-rural" : ""} ${z.id === selectedId ? "is-selected" : ""} ${conflicts.includes(z.id) ? "is-conflict" : ""}`;
      const name = document.createElement("span");
      name.textContent = z.name;
      const fee = document.createElement("strong");
      fee.textContent = formatFee(z.fee);
      el.append(name, fee);
      el.addEventListener("click", (event) => {
        if (latest.current.mode !== "view") return;
        event.stopPropagation();
        latest.current.onSelect(z.id);
      });
      return new maplibregl.Marker({ element: el }).setLngLat(labelPoint(z.area)).addTo(map);
    });
    if (!fitted.current && visible.length) {
      const bounds = boundsOf(visible.map((z) => z.area));
      if (bounds) map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 0 });
      fitted.current = true;
    }
    return () => markers.forEach((m) => m.remove());
  }, [zones, editingId, selectedId, conflicts, ready, formatFee]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("coverage") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: coverage ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...coverage.area, coverage.area[0]]] } }] : [],
    });
    if (!fitted.current && coverage && !zones.length) {
      const bounds = boundsOf([coverage.area]);
      if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 0 });
      fitted.current = true;
    }
  }, [coverage, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al elegir una zona, el mapa la encuadra.
  useEffect(() => {
    const map = mapRef.current;
    const zone = zones.find((z) => z.id === selectedId);
    if (!map || !ready || !zone) return;
    const bounds = boundsOf([zone.area]);
    if (bounds) map.fitBounds(bounds, { padding: 90, maxZoom: 17, duration: 600 });
  }, [selectedId, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("preview") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: preview && preview.length >= 3 ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...preview, preview[0]]] } }] : [],
    });
  }, [preview, ready]);

  const paintDraft = useCallback(
    (ring: LngLat[] | null, drawing: boolean) => {
      const source = mapRef.current?.getSource("draft") as GeoJSONSource | undefined;
      if (!source) return;
      const features: GeoJSON.Feature[] = [];
      if (ring && ring.length >= 3) features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } });
      else if (ring && drawing && ring.length >= 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } });
      source.setData({ type: "FeatureCollection", features });
    },
    [],
  );

  // Vértices arrastrables y puntos intermedios del borrador.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const drawing = mode === "draw";
    paintDraft(draft, drawing);
    if (!draft || (mode !== "draw" && mode !== "edit")) return;
    const markers: Marker[] = [];
    draft.forEach((vertex, index) => {
      const el = document.createElement("div");
      el.className = `area-vertex zone-vertex ${drawing && index === 0 && draft.length >= 3 ? "is-closing" : ""}`;
      el.title = labels.vertexHint;
      const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(vertex).addTo(map);
      marker.on("drag", () => {
        const { lng, lat } = marker.getLngLat();
        paintDraft(draft.map((v, i) => (i === index ? [lng, lat] : v)), drawing);
      });
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        onDraftChange(draft.map((v, i) => (i === index ? roundVertex([lng, lat]) : v)));
      });
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        if (drawing && index === 0 && draft.length >= 3) onCloseRing();
      });
      el.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        onDraftChange(draft.filter((_, i) => i !== index));
      });
      markers.push(marker);
    });
    if (!drawing && draft.length >= 3 && draft.length < maxVertices) {
      draft.forEach((vertex, index) => {
        const next = draft[(index + 1) % draft.length];
        const el = document.createElement("button");
        el.type = "button";
        el.className = "area-midpoint";
        el.title = labels.midpointHint;
        el.setAttribute("aria-label", labels.midpointHint);
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          const ring = [...draft];
          ring.splice(index + 1, 0, roundVertex(midpoint(vertex, next)));
          onDraftChange(ring);
        });
        markers.push(new maplibregl.Marker({ element: el }).setLngLat(midpoint(vertex, next)).addTo(map));
      });
    }
    return () => markers.forEach((m) => m.remove());
  }, [draft, mode, ready, paintDraft, onDraftChange, onCloseRing, maxVertices, labels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !probe) return;
    const el = document.createElement("div");
    el.className = "probe-pin";
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([probe.lng, probe.lat]).addTo(map);
    return () => void marker.remove();
  }, [probe, ready]);

  return (
    <div className="blueprint relative h-full min-h-[420px] w-full">
      {/* MapLibre le pone `position: relative` a su contenedor: el posicionamiento va en un envoltorio. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
    </div>
  );
}
