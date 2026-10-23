import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../../../app/theme.dart';
import '../../../../core/map/brand_map.dart';
import '../../../../core/map/map_images.dart';
import '../../../business/presentation/coverage_layers.dart' show geoJsonRing;
import '../../../establishments/domain/entities/establishment.dart';
import '../../../establishments/presentation/widgets/nearby_map.dart' show PlacePin;

/// Mapa del domiciliario en su pedido. Rumbo al local: la geocerca dibujada (zona amarilla con borde de
/// chontaduro), donde la llegada se marca sola. Rumbo al cliente: su puerta. El punto de tinta es él mismo,
/// con su propio GPS; esta posición no sale del teléfono hacia el cliente. Con el botón 3D se inclina, como la
/// vista de un navegador.
class TripMap extends StatefulWidget {
  const TripMap({super.key, required this.store, required this.area, required this.me, this.destination, this.towardsCustomer = false});

  final GeoPoint store;
  final List<GeoPoint> area;
  final GeoPoint? destination;
  final ValueNotifier<GeoPoint?> me;

  /// Ya salió del local: el encuadre va al destino y el área del local se atenúa.
  final bool towardsCustomer;

  @override
  State<TripMap> createState() => _TripMapState();
}

class _TripMapState extends State<TripMap> {
  static const _area = 'rapichonta-store-area';
  static const _places = 'rapichonta-trip-places';
  static const _me = 'rapichonta-trip-me';

  MapLibreMapController? _map;
  double _pixelRatio = 2;

  @override
  void initState() {
    super.initState();
    widget.me.addListener(_syncMe);
  }

  @override
  void didUpdateWidget(TripMap old) {
    super.didUpdateWidget(old);
    if (old.me != widget.me) {
      old.me.removeListener(_syncMe);
      widget.me.addListener(_syncMe);
      _syncMe();
    }
    final map = _map;
    if (map == null) return;
    if (old.destination != widget.destination || old.store != widget.store) map.setGeoJsonSource(_places, _placesData()).ignore();
    if (old.area != widget.area) map.setGeoJsonSource(_area, _areaData()).ignore();
    if (old.towardsCustomer != widget.towardsCustomer) {
      // Nueva etapa, nuevo encuadre.
      map.setLayerProperties('$_area-fill', _areaFill()).ignore();
      map.setLayerProperties('$_area-line', _areaLine()).ignore();
      _frame();
    }
  }

  @override
  void dispose() {
    widget.me.removeListener(_syncMe);
    super.dispose();
  }

  Map<String, dynamic> _point(GeoPoint p, Map<String, dynamic> properties) => {
        'type': 'Feature',
        'properties': properties,
        'geometry': {'type': 'Point', 'coordinates': [p.lng, p.lat]},
      };

  Map<String, dynamic> _areaData() => {
        'type': 'FeatureCollection',
        'features': [
          if (widget.area.length >= 3)
            {
              'type': 'Feature',
              'properties': <String, dynamic>{},
              'geometry': {'type': 'Polygon', 'coordinates': [geoJsonRing(widget.area)]},
            },
        ],
      };

  Map<String, dynamic> _placesData() => {
        'type': 'FeatureCollection',
        'features': [
          _point(widget.store, {'icon': 'trip-store'}),
          if (widget.destination != null) _point(widget.destination!, {'icon': 'trip-door'}),
        ],
      };

  Map<String, dynamic> _meData() => {
        'type': 'FeatureCollection',
        'features': [if (widget.me.value != null) _point(widget.me.value!, {})],
      };

  FillLayerProperties _areaFill() => FillLayerProperties(fillColor: mapColor(AppColors.brand.withValues(alpha: widget.towardsCustomer ? 0.12 : 0.32)));

  LineLayerProperties _areaLine() => LineLayerProperties(
        lineColor: mapColor(widget.towardsCustomer ? AppColors.chonta.withValues(alpha: 0.4) : AppColors.chontaStrong),
        lineWidth: 3,
        // Raya de 10 y espacio de 6 puntos, en unidades del grosor (3).
        lineDasharray: [3.3, 2],
      );

  void _syncMe() => _map?.setGeoJsonSource(_me, _meData()).ignore();

  Future<void> _onStyleLoaded(MapLibreMapController map) async {
    _map = map;
    final size = MapImages.iconSize(_pixelRatio);
    await MapImages.add(map, 'trip-store', MapImages.pinSize, () => MapImages.pin(const PlacePin(icon: 'store', open: true)), _pixelRatio);
    await MapImages.add(map, 'trip-door', MapImages.pinSize, () => MapImages.pin(const _DoorDrop()), _pixelRatio);
    await MapImages.add(map, 'trip-me', const Size(40, 40), () => const _MeDot(), _pixelRatio);
    await map.addGeoJsonSource(_area, _areaData());
    await map.addFillLayer(_area, '$_area-fill', _areaFill(), enableInteraction: false);
    await map.addLineLayer(_area, '$_area-line', _areaLine(), enableInteraction: false);
    await map.addGeoJsonSource(_places, _placesData());
    await map.addSymbolLayer(
      _places,
      _places,
      SymbolLayerProperties(iconImage: ['get', 'icon'], iconSize: size, iconAnchor: 'bottom', iconAllowOverlap: true, iconIgnorePlacement: true),
      enableInteraction: false,
    );
    await map.addGeoJsonSource(_me, _meData());
    await map.addSymbolLayer(
      _me,
      _me,
      SymbolLayerProperties(iconImage: 'trip-me', iconSize: size, iconAllowOverlap: true, iconIgnorePlacement: true),
      enableInteraction: false,
    );
    _frame();
  }

  List<GeoPoint> get _focus => [
        if (widget.towardsCustomer && widget.destination != null) widget.destination! else ...[widget.store, ...widget.area],
        if (widget.me.value != null) widget.me.value!,
      ];

  void _frame() {
    final map = _map;
    final focus = _focus;
    if (map == null) return;
    if (focus.length < 2) {
      map.animateCamera(CameraUpdate.newLatLngZoom(latLngOf(focus.first), 17)).ignore();
      return;
    }
    map
        .animateCamera(
          CameraUpdate.newLatLngBounds(
            LatLngBounds(
              southwest: LatLng(focus.map((p) => p.lat).reduce(math.min), focus.map((p) => p.lng).reduce(math.min)),
              northeast: LatLng(focus.map((p) => p.lat).reduce(math.max), focus.map((p) => p.lng).reduce(math.max)),
            ),
            left: 48,
            top: 72,
            right: 48,
            bottom: 48,
          ),
        )
        .ignore();
  }

  @override
  Widget build(BuildContext context) {
    _pixelRatio = MediaQuery.devicePixelRatioOf(context);
    return BrandMap(
      center: _focus.first,
      zoom: 17,
      tiltToggle: true,
      toggleAlignment: Alignment.bottomRight,
      onStyleLoaded: _onStyleLoaded,
    );
  }
}

/// La puerta del cliente: gota de tinta con la casa en amarillo (la misma del pedido del cliente).
class _DoorDrop extends StatelessWidget {
  const _DoorDrop();

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.topCenter,
        child: Transform.rotate(
          angle: -0.785398,
          child: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppColors.ink,
              borderRadius: const BorderRadius.only(topLeft: Radius.circular(19), topRight: Radius.circular(19), bottomRight: Radius.circular(19), bottomLeft: Radius.circular(5)),
              border: Border.all(color: AppColors.brand, width: 2.5),
              boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 4))],
            ),
            child: Transform.rotate(angle: 0.785398, child: const Icon(Icons.home_rounded, color: AppColors.brand, size: 18)),
          ),
        ),
      );
}

/// Él mismo: la moto en un sello de tinta con halo amarillo.
class _MeDot extends StatelessWidget {
  const _MeDot();

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(shape: BoxShape.circle, color: AppColors.brand.withValues(alpha: 0.35)),
        padding: const EdgeInsets.all(5),
        child: Container(
          decoration: BoxDecoration(shape: BoxShape.circle, color: AppColors.ink, border: Border.all(color: Colors.white, width: 2)),
          child: const Icon(Icons.two_wheeler_rounded, size: 15, color: AppColors.brand),
        ),
      );
}
