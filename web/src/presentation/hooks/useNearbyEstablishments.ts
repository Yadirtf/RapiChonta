"use client";

import { useEffect, useState } from "react";
import type { Establishment, GeoPoint } from "@/core/domain/entities/establishment";
import { container } from "@/infrastructure/di/container";

/** `home`: centro del municipio abierto más cercano; amplía la búsqueda cuando el cliente está a las afueras. */
export function useNearbyEstablishments(origin: GeoPoint, categories: string[], enabled: boolean, home?: GeoPoint) {
  const [data, setData] = useState<Establishment[]>([]);
  // Código de error; la vista lo traduce con messages/<idioma>.json (errors.*).
  const [error, setError] = useState<"NEARBY_FAILED" | null>(null);
  const [loading, setLoading] = useState(false);
  const key = [...categories].sort().join(",");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    container.getNearbyEstablishments
      .execute(origin, key ? key.split(",") : [], home)
      .then((result) => !cancelled && (setData(result), setError(null)))
      .catch(() => !cancelled && setError("NEARBY_FAILED"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [origin.lat, origin.lng, home?.lat, home?.lng, key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading };
}
