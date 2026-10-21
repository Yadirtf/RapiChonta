"use client";

import { useEffect, useState } from "react";
import type { CoverageArea } from "@/core/domain/entities/business";
import { container } from "@/infrastructure/di/container";

// Una sola petición por visita: la cobertura cambia pocas veces y la API la cachea 5 minutos.
let cached: Promise<CoverageArea[]> | null = null;

function load(): Promise<CoverageArea[]> {
  cached ??= container.business.coverage().catch(() => {
    cached = null;
    return [];
  });
  return cached;
}

/** Cobertura de los municipios abiertos (H03.5). `null` mientras carga; vacía si la API no respondió. */
export function useCoverage(): CoverageArea[] | null {
  const [areas, setAreas] = useState<CoverageArea[] | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((a) => alive && setAreas(a));
    return () => {
      alive = false;
    };
  }, []);
  return areas;
}
