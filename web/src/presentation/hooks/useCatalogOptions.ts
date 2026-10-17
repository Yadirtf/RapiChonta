"use client";

import { container } from "@/infrastructure/di/container";
import { useResource } from "./useResource";

/** Municipios, categorías, íconos y límites para los formularios del catálogo en el panel. */
export function useCatalogOptions() {
  return useResource(() => container.catalogAdmin.options(), []);
}
