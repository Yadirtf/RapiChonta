import type * as GeoJSON from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { CoverageArea } from "@/core/domain/entities/business";
import { outsideMask } from "@/core/domain/entities/zone-geometry";

const MASK = "coverage-mask";
const EDGE = "coverage-edge";

/**
 * Pinta la cobertura sobre el mapa del cliente (H03.5): lo que queda fuera se oscurece con tinta y el borde
 * es una línea punteada de chontaduro sobre un halo amarillo, como la raya de una carretera. Se puede llamar
 * de nuevo con otras áreas; espera a que el estilo cargue.
 */
export function paintCoverage(map: MapLibreMap, areas: CoverageArea[], { dim = 0.28 } = {}) {
  const apply = () => {
    const polygons = areas.flatMap((a) => a.polygons);
    const mask: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: polygons.length ? [outsideMask(polygons)] : [] };
    const edges: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: polygons.map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates } })),
    };
    const existing = map.getSource(MASK) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(mask);
      (map.getSource(EDGE) as GeoJSONSource).setData(edges);
      return;
    }
    map.addSource(MASK, { type: "geojson", data: mask });
    map.addSource(EDGE, { type: "geojson", data: edges });
    map.addLayer({ id: `${MASK}-fill`, type: "fill", source: MASK, paint: { "fill-color": "#14121f", "fill-opacity": dim } });
    map.addLayer({ id: `${EDGE}-halo`, type: "line", source: EDGE, paint: { "line-color": "#ffc531", "line-width": 7, "line-opacity": 0.55, "line-blur": 1 } });
    map.addLayer({ id: `${EDGE}-line`, type: "line", source: EDGE, paint: { "line-color": "#b83a1b", "line-width": 2.5, "line-dasharray": [2.5, 1.6] } });
  };
  if (map.isStyleLoaded()) apply();
  // "idle" llega tanto después de la primera carga como después de un cambio de estilo.
  else map.once("idle", apply);
}
