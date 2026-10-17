"use client";

import { useEffect, useState } from "react";
import type { Category } from "@/core/domain/entities/establishment";
import { container } from "@/infrastructure/di/container";

/** El catálogo de categorías cambia poco: una sola petición por carga de la página. */
let cached: Promise<Category[]> | null = null;

export function useCategories() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cached ??= container.establishments.categories().catch((e) => {
      cached = null;
      throw e;
    });
    cached.then((list) => !cancelled && setCategories(list)).catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, error };
}
