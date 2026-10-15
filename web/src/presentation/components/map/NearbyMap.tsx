"use client";

import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Establishment, GeoPoint } from "@/core/domain/entities/establishment";

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

interface Props {
  center: GeoPoint;
  establishments: Establishment[];
  onSelect?: (establishment: Establishment) => void;
}

export function NearbyMap({ center, establishments, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [center.lng, center.lat],
      zoom: 15,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;
    return () => map.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = establishments.map((e) => {
      const el = document.createElement("button");
      el.className = "place-pin";
      el.setAttribute("aria-label", e.name);
      el.textContent = e.name.charAt(0);
      el.addEventListener("click", () => onSelect?.(e));
      return new maplibregl.Marker({ element: el }).setLngLat([e.location.lng, e.location.lat]).addTo(map);
    });
  }, [establishments, onSelect]);

  return <div ref={containerRef} className="h-full w-full" />;
}
