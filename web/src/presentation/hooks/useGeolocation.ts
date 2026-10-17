"use client";

import { useEffect, useState } from "react";
import { distanceMeters, type GeoPoint } from "@/core/domain/entities/establishment";

/** Centro de Villagarzón (Putumayo), ciudad de lanzamiento del MVP. Se usa si el usuario no comparte ubicación. */
export const DEFAULT_CENTER: GeoPoint = { lat: 1.0294, lng: -76.6165 };

/** Más lejos que esto del centro no hay locales que mostrar: el mapa se abre en Villagarzón en lugar de la posición real. */
const SERVICE_RADIUS_METERS = 15_000;

type GeoState = { position: GeoPoint; status: "loading" | "granted" | "denied" | "outside" };

export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>({ position: DEFAULT_CENTER, status: "loading" });

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setState((s) => ({ ...s, status: "denied" }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = { lat: coords.latitude, lng: coords.longitude };
        setState(distanceMeters(position, DEFAULT_CENTER) > SERVICE_RADIUS_METERS ? { position: DEFAULT_CENTER, status: "outside" } : { position, status: "granted" });
      },
      () => setState((s) => ({ ...s, status: "denied" })),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  return state;
}
