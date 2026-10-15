"use client";

import { useEffect, useState } from "react";
import type { GeoPoint } from "@/core/domain/entities/establishment";

/** Centro por defecto si el usuario no comparte ubicación. Ajustar a la ciudad de lanzamiento. */
export const DEFAULT_CENTER: GeoPoint = { lat: 4.6097, lng: -74.0817 };

type GeoState = { position: GeoPoint; status: "loading" | "granted" | "denied" };

export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>({ position: DEFAULT_CENTER, status: "loading" });

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setState((s) => ({ ...s, status: "denied" }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setState({ position: { lat: coords.latitude, lng: coords.longitude }, status: "granted" }),
      () => setState((s) => ({ ...s, status: "denied" })),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  return state;
}
