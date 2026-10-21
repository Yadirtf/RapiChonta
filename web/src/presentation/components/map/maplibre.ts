import * as maplibregl from "maplibre-gl";

/**
 * MapLibre 6 es ESM y busca su worker junto a su propio archivo, que al empaquetarlo con Next.js ya no
 * existe. Webpack emite el worker como recurso (con hash) y aquí se le dice a MapLibre dónde quedó.
 * Todos los mapas importan MapLibre desde este módulo.
 */
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
}

export { maplibregl };
