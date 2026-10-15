"use client";

import { useEffect, useState } from "react";
import type { Establishment, EstablishmentCategory, GeoPoint } from "@/core/domain/entities/establishment";
import { container } from "@/infrastructure/di/container";

export function useNearbyEstablishments(origin: GeoPoint, categories: EstablishmentCategory[], enabled: boolean) {
  const [data, setData] = useState<Establishment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = categories.join(",");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    container.getNearbyEstablishments
      .execute(origin, key.split(",") as EstablishmentCategory[])
      .then((result) => !cancelled && (setData(result), setError(null)))
      .catch(() => !cancelled && setError("No pudimos cargar los establecimientos cercanos."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [origin.lat, origin.lng, key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading };
}
