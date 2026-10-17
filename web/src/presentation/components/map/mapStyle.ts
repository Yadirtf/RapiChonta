import maplibregl, { type LayerSpecification, type MapOptions, type StyleSpecification } from "maplibre-gl";

/**
 * Mapa base: OpenFreeMap "liberty" (gratis, sin clave; datos de OpenStreetMap) repintado con la paleta
 * de RapiChonta. Solo cambian colores: las calles, ríos y lugares son los mismos datos de OSM.
 * Con NEXT_PUBLIC_MAP_STYLE_URL se puede usar otro estilo; los colores se aplican solo a las capas
 * que tengan los mismos nombres que liberty (esquema OpenMapTiles), el resto queda como viene.
 */
export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

const palette = {
  land: "#fbf3e4",
  residential: "#f6e6cc",
  park: "#bfe3a6",
  parkEdge: "#8fcb78",
  forest: "hsla(110, 48%, 60%, 0.75)",
  grass: "#b9de98",
  water: "#5cb8e6",
  river: "#4aa8dc",
  waterLabel: "#1f5f8b",
  building: "#f1d2bc",
  buildingEdge: "#ddb295",
  trunk: "#f0804a",
  trunkCasing: "#b83a1b",
  primary: "#ffc531",
  primaryCasing: "#d99a12",
  secondary: "#ffe48a",
  secondaryCasing: "#e3b44e",
  street: "#ffffff",
  streetCasing: "#e6d3b8",
  rail: "#b7a99a",
  label: "#2a1f1a",
  labelSoft: "#6b4f3f",
  halo: "#fff9ee",
};

type Paint = Record<string, unknown>;

// Las vías troncales (la que atraviesa el pueblo) van en chontaduro; las principales, en amarillo marca.
const trunkOrPrimary = (trunk: string, primary: string) => ["match", ["get", "class"], ["trunk", "motorway"], trunk, primary];

/** Colores por tipo de vía; aplica igual a las capas road_, bridge_ y tunnel_ de liberty. */
const roads: Record<string, Paint> = {
  motorway: { "line-color": palette.trunk },
  motorway_casing: { "line-color": palette.trunkCasing },
  motorway_link: { "line-color": palette.trunk },
  motorway_link_casing: { "line-color": palette.trunkCasing },
  trunk_primary: { "line-color": trunkOrPrimary(palette.trunk, palette.primary) },
  trunk_primary_casing: { "line-color": trunkOrPrimary(palette.trunkCasing, palette.primaryCasing) },
  secondary_tertiary: { "line-color": palette.secondary },
  secondary_tertiary_casing: { "line-color": palette.secondaryCasing },
  link: { "line-color": palette.secondary },
  link_casing: { "line-color": palette.secondaryCasing },
  minor: { "line-color": palette.street },
  minor_casing: { "line-color": palette.streetCasing },
  street: { "line-color": palette.street },
  street_casing: { "line-color": palette.streetCasing },
  service_track: { "line-color": palette.street },
  service_track_casing: { "line-color": palette.streetCasing },
  major_rail: { "line-color": palette.rail },
  major_rail_hatching: { "line-color": palette.rail },
  transit_rail: { "line-color": palette.rail },
  transit_rail_hatching: { "line-color": palette.rail },
};

const layers: Record<string, Paint> = {
  background: { "background-color": palette.land },
  landuse_residential: { "fill-color": ["interpolate", ["linear"], ["zoom"], 9, "hsla(36, 60%, 88%, 0.6)", 12, palette.residential] },
  park: { "fill-color": palette.park, "fill-outline-color": palette.parkEdge },
  park_outline: { "line-color": palette.parkEdge },
  landcover_wood: { "fill-color": palette.forest },
  landcover_grass: { "fill-color": palette.grass },
  landcover_sand: { "fill-color": "#f9e7b5" },
  landuse_pitch: { "fill-color": "#c9e7b0" },
  landuse_track: { "fill-color": "#c9e7b0" },
  landuse_cemetery: { "fill-color": "#d3e3b8" },
  landuse_hospital: { "fill-color": "#ffdcdc" },
  landuse_school: { "fill-color": "#fdf0c2" },
  water: { "fill-color": palette.water },
  waterway_river: { "line-color": palette.river },
  waterway_other: { "line-color": palette.river },
  waterway_tunnel: { "line-color": "#8fcbeb" },
  waterway_line_label: { "text-color": palette.waterLabel, "text-halo-color": palette.halo },
  water_name_point_label: { "text-color": palette.waterLabel, "text-halo-color": palette.halo },
  water_name_line_label: { "text-color": palette.waterLabel, "text-halo-color": palette.halo },
  building: { "fill-color": palette.building, "fill-outline-color": palette.buildingEdge },
  "building-3d": { "fill-extrusion-color": palette.building },
  poi_r20: { "text-color": palette.labelSoft, "text-halo-color": palette.halo },
  poi_r7: { "text-color": palette.labelSoft, "text-halo-color": palette.halo },
  poi_r1: { "text-color": palette.labelSoft, "text-halo-color": palette.halo },
  "highway-name-path": { "text-color": palette.labelSoft, "text-halo-color": palette.halo },
  "highway-name-minor": { "text-color": palette.labelSoft, "text-halo-color": palette.halo },
  "highway-name-major": { "text-color": palette.label, "text-halo-color": palette.halo },
  label_other: { "text-color": palette.labelSoft, "text-halo-color": palette.halo },
  label_village: { "text-color": palette.label, "text-halo-color": palette.halo },
  label_town: { "text-color": palette.label, "text-halo-color": palette.halo },
  label_city: { "text-color": palette.label, "text-halo-color": palette.halo },
};

function paintFor(id: string): Paint | undefined {
  if (layers[id]) return layers[id];
  const road = /^(?:road|bridge|tunnel)_(.+)$/.exec(id);
  return road ? roads[road[1]] : undefined;
}

/** Repinta las capas conocidas del estilo base sin tocar su geometría ni sus filtros. */
export function paintRapiChonta(_previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  return {
    ...next,
    layers: next.layers.map((layer) => {
      const paint = paintFor(layer.id);
      return paint ? ({ ...layer, paint: { ...layer.paint, ...paint } } as LayerSpecification) : layer;
    }),
  };
}

/** Crea un mapa de MapLibre con el estilo de RapiChonta. */
export function createBrandMap(options: Omit<MapOptions, "style">) {
  const map = new maplibregl.Map(options);
  map.setStyle(MAP_STYLE_URL, { transformStyle: paintRapiChonta });
  return map;
}
