"use client";

import { useEffect, useMemo, useState } from "react";
import { distanceMeters, type GeoPoint } from "@/core/domain/entities/establishment";
import { useCoverage } from "./useCoverage";

/** Centro de Villagarzón (Putumayo), ciudad de lanzamiento del MVP. Se usa mientras carga la cobertura o si no hay ninguna. */
export const DEFAULT_CENTER: GeoPoint = { lat: 1.0294, lng: -76.6165 };

/** Más lejos que esto de todo municipio abierto no hay locales que mostrar: el mapa se abre en el más cercano. */
const SERVICE_RADIUS_METERS = 15_000;

type GeoStatus = "loading" | "granted" | "denied" | "outside";
type GeoState = {
  position: GeoPoint;
  status: GeoStatus;
  /** Lo que reportó el GPS, aunque esté lejos (para decir a cuánto queda la cobertura). */
  device: GeoPoint | null;
  /** Centro del municipio abierto más cercano: donde arranca el mapa si no hay ubicación útil. */
  home: GeoPoint;
};

/**
 * Ubicación del cliente. Con varios municipios abiertos (H03.5) se compara con todos: el mapa arranca en
 * el más cercano y "outside" significa que el cliente está lejos de cualquiera de ellos.
 */
export function useGeolocation(): GeoState {
  const [raw, setRaw] = useState<{ device: GeoPoint | null; status: "loading" | "granted" | "denied" }>({ device: null, status: "loading" });
  const coverage = useCoverage();

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setRaw({ device: null, status: "denied" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setRaw({ device: { lat: coords.latitude, lng: coords.longitude }, status: "granted" }),
      () => setRaw({ device: null, status: "denied" }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  return useMemo(() => {
    const centers = coverage?.length ? coverage.map((c) => c.municipality.center) : [DEFAULT_CENTER];
    const from = raw.device ?? DEFAULT_CENTER;
    const home = centers.reduce((best, c) => (distanceMeters(from, c) < distanceMeters(from, best) ? c : best), centers[0]);
    if (raw.status !== "granted" || !raw.device) return { position: home, status: raw.status, device: null, home };
    if (distanceMeters(raw.device, home) > SERVICE_RADIUS_METERS) return { position: home, status: "outside", device: raw.device, home };
    return { position: raw.device, status: "granted", device: raw.device, home };
  }, [raw, coverage]);
}
