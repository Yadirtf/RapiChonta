import 'dart:math' show Point;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../app/theme.dart';
import '../../features/establishments/domain/entities/establishment.dart' show GeoPoint;
import '../../l10n/app_localizations.dart';
import 'map_style.dart';
import 'offline_area.dart';

LatLng latLngOf(GeoPoint p) => LatLng(p.lat, p.lng);
GeoPoint geoPointOf(LatLng p) => GeoPoint(p.latitude, p.longitude);

/// Color de Flutter en el formato de MapLibre (rgba con su transparencia).
String mapColor(Color c) => 'rgba(${(c.r * 255).round()}, ${(c.g * 255).round()}, ${(c.b * 255).round()}, ${c.a.toStringAsFixed(3)})';

/// Inclinación del modo 3D: se ven los edificios de pie y el relieve, sin perder la calle de enfrente.
const tilt3d = 55.0;

/// Mapa base de RapiChonta (MapLibre, vectorial, en la GPU): mismo estilo de la web, botón 2D/3D opcional y
/// Villagarzón guardado en el teléfono. Las capas propias de cada pantalla se agregan en [onStyleLoaded], que
/// vuelve a llamarse si Android recrea el mapa.
class BrandMap extends ConsumerStatefulWidget {
  const BrandMap({
    super.key,
    required this.center,
    this.zoom = 15,
    this.interactive = true,
    this.tiltToggle = false,
    this.toggleAlignment = Alignment.topRight,
    this.togglePadding = const EdgeInsets.all(12),
    this.handle,
    this.onStyleLoaded,
    this.onFeatureTap,
    this.onCameraMove,
    this.onCameraIdle,
  });

  final GeoPoint center;
  final double zoom;
  final bool interactive;

  /// Muestra el botón 2D/3D (en los mapas donde se apunta un punto exacto conviene dejarlo plano).
  final bool tiltToggle;
  final Alignment toggleAlignment;
  final EdgeInsets togglePadding;

  /// Para mover el mapa desde afuera y saber si el usuario lo dejó en 3D.
  final MapHandle? handle;

  final ValueChanged<MapLibreMapController>? onStyleLoaded;

  /// Toque sobre un elemento de una capa propia: id del elemento y de la capa.
  final void Function(String id, String layerId)? onFeatureTap;
  final ValueChanged<CameraPosition>? onCameraMove;
  final ValueChanged<CameraPosition?>? onCameraIdle;

  @override
  ConsumerState<BrandMap> createState() => _BrandMapState();
}

class _BrandMapState extends ConsumerState<BrandMap> {
  MapLibreMapController? _map;
  bool _tilted = false;

  void _onCreated(MapLibreMapController map) {
    _map = map;
    widget.handle?.attach(map);
    map.onFeatureTapped.add(_onFeatureTapped);
  }

  void _onFeatureTapped(Point<double> point, LatLng coordinates, String id, String layerId, Annotation? annotation) =>
      widget.onFeatureTap?.call(id, layerId);

  void _onStyleLoaded() {
    final map = _map;
    if (map == null) return;
    if (_tilted) map.setLayerVisibility(hillshadeLayerId, true).ignore();
    widget.onStyleLoaded?.call(map);
    OfflineArea.ensure();
  }

  Future<void> _toggleTilt() async {
    final map = _map;
    if (map == null) return;
    setState(() => _tilted = !_tilted);
    widget.handle?.tilted = _tilted;
    await map.animateCamera(CameraUpdate.tiltTo(_tilted ? tilt3d : 0), duration: const Duration(milliseconds: 600));
    await map.setLayerVisibility(hillshadeLayerId, _tilted).catchError((_) {});
  }

  @override
  void dispose() {
    _map?.onFeatureTapped.remove(_onFeatureTapped);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final style = ref.watch(mapStyleProvider);
    // Mientras llega el estilo (de la caché, casi siempre al instante) se ve el fondo crema del mapa.
    final styleString = style.value;
    if (styleString == null) return const ColoredBox(color: Color(0xFFFBF3E4), child: SizedBox.expand());
    final l10n = AppLocalizations.of(context);
    return Stack(
      children: [
        MapLibreMap(
          styleString: styleString,
          initialCameraPosition: CameraPosition(target: latLngOf(widget.center), zoom: widget.zoom),
          onMapCreated: _onCreated,
          onStyleLoadedCallback: _onStyleLoaded,
          trackCameraPosition: widget.onCameraMove != null || widget.onCameraIdle != null,
          onCameraMove: widget.onCameraMove,
          onCameraIdle: widget.onCameraIdle == null ? null : () => widget.onCameraIdle!(_map?.cameraPosition),
          // Hasta 19: más cerca ya no hay detalle en los datos de OSM (los encuadres automáticos tampoco pasan).
          minMaxZoomPreference: const MinMaxZoomPreference(3, 19),
          rotateGesturesEnabled: false,
          compassEnabled: false,
          scrollGesturesEnabled: widget.interactive,
          zoomGesturesEnabled: widget.interactive,
          tiltGesturesEnabled: widget.interactive && widget.tiltToggle,
          dragEnabled: widget.interactive,
          doubleClickZoomEnabled: widget.interactive,
          attributionButtonPosition: AttributionButtonPosition.bottomLeft,
          // En la web, MapLibre ya trae su propio aviso de atribución.
          attributionButtonMargins: kIsWeb ? null : const Point(8, 8),
        ),
        if (widget.tiltToggle)
          Align(
            alignment: widget.toggleAlignment,
            child: Padding(
              padding: widget.togglePadding,
              child: Semantics(
                button: true,
                label: _tilted ? l10n.mapFlatView : l10n.map3dView,
                child: Material(
                  color: _tilted ? AppColors.ink : Colors.white,
                  shape: const CircleBorder(),
                  elevation: 3,
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: _toggleTilt,
                    child: SizedBox.square(
                      dimension: 44,
                      child: Center(
                        child: Text(
                          _tilted ? '2D' : '3D',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: _tilted ? AppColors.brand : AppColors.ink),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Para mover el mapa desde la pantalla que lo contiene (por ejemplo, al usar la ubicación del teléfono).
class MapHandle {
  MapLibreMapController? _map;

  /// El usuario dejó el mapa en 3D con el botón.
  bool tilted = false;

  // ignore: use_setters_to_change_properties
  void attach(MapLibreMapController map) => _map = map;

  Future<void> move(GeoPoint point, double zoom) async {
    await _map?.animateCamera(CameraUpdate.newLatLngZoom(latLngOf(point), zoom));
  }
}
