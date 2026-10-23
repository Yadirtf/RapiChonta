import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../config/env.dart';

/// Mapa base: OpenFreeMap "liberty" (gratis, sin clave; datos de OpenStreetMap), el mismo de la web, repintado
/// con la paleta de RapiChonta (copia de web/src/presentation/components/map/mapStyle.ts). Solo cambian
/// colores: las calles, ríos y lugares son los mismos datos de OSM. Se le suma el relieve (hillshade) que
/// enciende el modo 3D.
const _palette = (
  land: '#fbf3e4',
  residential: '#f6e6cc',
  park: '#bfe3a6',
  parkEdge: '#8fcb78',
  forest: 'hsla(110, 48%, 60%, 0.75)',
  grass: '#b9de98',
  water: '#5cb8e6',
  river: '#4aa8dc',
  waterLabel: '#1f5f8b',
  building: '#f1d2bc',
  buildingEdge: '#ddb295',
  trunk: '#f0804a',
  trunkCasing: '#b83a1b',
  primary: '#ffc531',
  primaryCasing: '#d99a12',
  secondary: '#ffe48a',
  secondaryCasing: '#e3b44e',
  street: '#ffffff',
  streetCasing: '#e6d3b8',
  rail: '#b7a99a',
  label: '#2a1f1a',
  labelSoft: '#6b4f3f',
  halo: '#fff9ee',
);

// La troncal (la que atraviesa el pueblo) va en chontaduro; las principales, en amarillo marca.
List<Object> _trunkOrPrimary(String trunk, String primary) => [
      'match',
      ['get', 'class'],
      ['trunk', 'motorway'],
      trunk,
      primary,
    ];

/// Colores por tipo de vía; aplica igual a las capas road_, bridge_ y tunnel_ de liberty.
final _roads = <String, Map<String, Object>>{
  'motorway': {'line-color': _palette.trunk},
  'motorway_casing': {'line-color': _palette.trunkCasing},
  'motorway_link': {'line-color': _palette.trunk},
  'motorway_link_casing': {'line-color': _palette.trunkCasing},
  'trunk_primary': {'line-color': _trunkOrPrimary(_palette.trunk, _palette.primary)},
  'trunk_primary_casing': {'line-color': _trunkOrPrimary(_palette.trunkCasing, _palette.primaryCasing)},
  'secondary_tertiary': {'line-color': _palette.secondary},
  'secondary_tertiary_casing': {'line-color': _palette.secondaryCasing},
  'link': {'line-color': _palette.secondary},
  'link_casing': {'line-color': _palette.secondaryCasing},
  'minor': {'line-color': _palette.street},
  'minor_casing': {'line-color': _palette.streetCasing},
  'street': {'line-color': _palette.street},
  'street_casing': {'line-color': _palette.streetCasing},
  'service_track': {'line-color': _palette.street},
  'service_track_casing': {'line-color': _palette.streetCasing},
  'major_rail': {'line-color': _palette.rail},
  'major_rail_hatching': {'line-color': _palette.rail},
  'transit_rail': {'line-color': _palette.rail},
  'transit_rail_hatching': {'line-color': _palette.rail},
};

Map<String, Object> _label(String color) => {'text-color': color, 'text-halo-color': _palette.halo};

final _layers = <String, Map<String, Object>>{
  'background': {'background-color': _palette.land},
  'landuse_residential': {
    'fill-color': ['interpolate', ['linear'], ['zoom'], 9, 'hsla(36, 60%, 88%, 0.6)', 12, _palette.residential],
  },
  'park': {'fill-color': _palette.park, 'fill-outline-color': _palette.parkEdge},
  'park_outline': {'line-color': _palette.parkEdge},
  'landcover_wood': {'fill-color': _palette.forest},
  'landcover_grass': {'fill-color': _palette.grass},
  'landcover_sand': {'fill-color': '#f9e7b5'},
  'landuse_pitch': {'fill-color': '#c9e7b0'},
  'landuse_track': {'fill-color': '#c9e7b0'},
  'landuse_cemetery': {'fill-color': '#d3e3b8'},
  'landuse_hospital': {'fill-color': '#ffdcdc'},
  'landuse_school': {'fill-color': '#fdf0c2'},
  'water': {'fill-color': _palette.water},
  'waterway_river': {'line-color': _palette.river},
  'waterway_other': {'line-color': _palette.river},
  'waterway_tunnel': {'line-color': '#8fcbeb'},
  'waterway_line_label': _label(_palette.waterLabel),
  'water_name_point_label': _label(_palette.waterLabel),
  'water_name_line_label': _label(_palette.waterLabel),
  'building': {'fill-color': _palette.building, 'fill-outline-color': _palette.buildingEdge},
  'building-3d': {'fill-extrusion-color': _palette.building},
  'poi_r20': _label(_palette.labelSoft),
  'poi_r7': _label(_palette.labelSoft),
  'poi_r1': _label(_palette.labelSoft),
  'highway-name-path': _label(_palette.labelSoft),
  'highway-name-minor': _label(_palette.labelSoft),
  'highway-name-major': _label(_palette.label),
  'label_other': _label(_palette.labelSoft),
  'label_village': _label(_palette.label),
  'label_town': _label(_palette.label),
  'label_city': _label(_palette.label),
};

Map<String, Object>? _paintFor(String id) {
  final known = _layers[id];
  if (known != null) return known;
  final road = RegExp(r'^(?:road|bridge|tunnel)_(.+)$').firstMatch(id);
  return road == null ? null : _roads[road.group(1)];
}

/// Capa del relieve: apagada hasta que se pide el 3D (oculta, MapLibre no descarga sus teselas).
const hillshadeLayerId = 'rapichonta-hillshade';

/// Relieve: Terrain Tiles de AWS (datos abiertos, gratis, sin clave), codificación terrarium.
const _demSource = {
  'type': 'raster-dem',
  'tiles': ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  'encoding': 'terrarium',
  'tileSize': 256,
  'maxzoom': 13,
  'attribution': '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>',
};

/// Repinta las capas conocidas sin tocar su geometría ni sus filtros y mete el relieve bajo las vías.
@visibleForTesting
Map<String, dynamic> paintRapiChonta(Map<String, dynamic> style) {
  final layers = [
    for (final layer in (style['layers'] as List).cast<Map<String, dynamic>>())
      if (_paintFor(layer['id'] as String) case final paint?) {...layer, 'paint': {...?(layer['paint'] as Map?)?.cast<String, dynamic>(), ...paint}} else layer,
  ];
  // Debajo de la primera vía o etiqueta, para que el sombreado no apague calles ni nombres.
  final under = layers.indexWhere((l) => l['type'] == 'line' || l['type'] == 'symbol' || l['type'] == 'fill-extrusion');
  layers.insert(under < 0 ? layers.length : under, {
    'id': hillshadeLayerId,
    'type': 'hillshade',
    'source': 'rapichonta-dem',
    'layout': {'visibility': 'none'},
    'paint': {'hillshade-shadow-color': '#6b4f3f', 'hillshade-highlight-color': '#fff9ee', 'hillshade-exaggeration': 0.45},
  });
  return {
    ...style,
    'sources': {...(style['sources'] as Map).cast<String, dynamic>(), 'rapichonta-dem': _demSource},
    'layers': layers,
  };
}

/// Estilo listo para MapLibre: el JSON repintado (se guarda en el teléfono, así la próxima vez el mapa abre sin
/// esperar la red) o, si nunca se pudo bajar, la URL del estilo tal cual.
final mapStyleProvider = FutureProvider<String>((ref) async {
  final cache = kIsWeb ? null : File('${(await getApplicationSupportDirectory()).path}/map-style-v1.json');
  if (cache != null && cache.existsSync()) {
    // Lo guardado sirve ya; en segundo plano se refresca para la próxima vez.
    _refresh(cache).ignore();
    return cache.readAsString();
  }
  return await _refresh(cache) ?? Env.mapStyleUrl;
});

Future<String?> _refresh(File? cache) async {
  try {
    final response = await Dio().get<Map<String, dynamic>>(Env.mapStyleUrl, options: Options(receiveTimeout: const Duration(seconds: 15)));
    final style = jsonEncode(paintRapiChonta(response.data!));
    await cache?.writeAsString(style);
    return style;
  } catch (_) {
    return null;
  }
}
