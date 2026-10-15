"use client";

import { useEffect, useState } from "react";
import type { GeoPoint } from "@/core/domain/entities/establishment";

/** Centro de Villagarzón (Putumayo), ciudad de lanzamiento del MVP. Se usa si el usuario no comparte ubicación. */
export const DEFAULT_CENTER: GeoPoint = { lat: 1.0294, lng: -76.6165 };

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
