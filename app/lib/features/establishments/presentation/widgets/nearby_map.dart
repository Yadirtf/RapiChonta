import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../../../app/theme.dart';
import '../../../../core/map/brand_map.dart';
import '../../../../core/map/map_images.dart';
import '../../../business/domain/business.dart';
import '../../../business/presentation/coverage_layers.dart';
import '../../domain/entities/establishment.dart';
import 'category_icon.dart';

class NearbyMap extends StatefulWidget {
  const NearbyMap({super.key, required this.center, required this.establishments, required this.onSelect, this.selectedId, this.coverage = const []});

  final GeoPoint center;
  final List<Establishment> establishments;
  final ValueChanged<Establishment> onSelect;
  final String? selectedId;

  /// Hasta dónde llegamos (H03.5): lo de afuera se ve apagado.
  final List<CoverageArea> coverage;

  @override
  State<NearbyMap> createState() => _NearbyMapState();
}

class _NearbyMapState extends State<NearbyMap> {
  static const _places = 'rapichonta-places';
  static const _me = 'rapichonta-me';

  MapLibreMapController? _map;
  final _images = <String>{};
  GeoPoint? _framedFor;
  double _pixelRatio = 2;
  int _placesVersion = 0;

  /// Logos ya descargados por URL (null: no cargó, se queda el pin de la categoría).
  final _logos = <String, ui.Image?>{};

  @override
  void didUpdateWidget(NearbyMap old) {
    super.didUpdateWidget(old);
    if (old.center != widget.center) _framedFor = null;
    final map = _map;
    if (map == null) return;
    if (old.coverage != widget.coverage) CoverageLayers.update(map, widget.coverage).ignore();
    if (old.center != widget.center) map.setGeoJsonSource(_me, _meData()).ignore();
    if (old.establishments != widget.establishments || old.selectedId != widget.selectedId) _syncPlaces();
  }

  Future<void> _onStyleLoaded(MapLibreMapController map) async {
    _map = map;
    _images.clear();
    await CoverageLayers.add(map, widget.coverage);
    await map.addGeoJsonSource(_me, _meData());
    await map.addCircleLayer(
      _me,
      _me,
      CircleLayerProperties(circleColor: mapColor(Colors.blue), circleRadius: 8, circleStrokeColor: '#ffffff', circleStrokeWidth: 3),
      enableInteraction: false,
    );
    await map.addGeoJsonSource(_places, const {'type': 'FeatureCollection', 'features': []});
    await map.addSymbolLayer(
      _places,
      _places,
      SymbolLayerProperties(
        iconImage: ['get', 'icon'],
        iconSize: MapImages.iconSize(_pixelRatio),
        iconAnchor: 'bottom',
        iconAllowOverlap: true,
        iconIgnorePlacement: true,
        // El seleccionado queda encima de los vecinos.
        symbolSortKey: ['get', 'sort'],
        iconPitchAlignment: 'viewport',
      ),
    );
    await _syncPlaces();
    _frameNearest();
  }

  Map<String, dynamic> _meData() => {
        'type': 'FeatureCollection',
        'features': [
          {
            'type': 'Feature',
            'properties': <String, dynamic>{},
            'geometry': {'type': 'Point', 'coordinates': [widget.center.lng, widget.center.lat]},
          },
        ],
      };

  static String _pinName(String icon, bool open, bool selected) => 'place-$icon-${open ? 1 : 0}${selected ? 1 : 0}';

  /// La URL firmada cambia cada pocas horas; el nombre cambia con ella para no reusar un logo viejo.
  static String _logoPinName(Establishment e, bool selected) =>
      'place-logo-${e.id}-${e.logoUrl.hashCode}-${e.categoryIcon}-${e.acceptsOrders ? 1 : 0}${selected ? 1 : 0}';

  /// Primero se pinta la gota con la categoría; cuando llega el logo, se repinta con él.
  void _loadLogo(String url) {
    if (_logos.containsKey(url)) return;
    _logos[url] = null;
    MapImages.logo(url).then((image) {
      if (!mounted || image == null) return;
      _logos[url] = image;
      _syncPlaces();
    });
  }

  Future<void> _syncPlaces() async {
    final map = _map;
    if (map == null) return;
    final version = ++_placesVersion;
    final features = <Map<String, dynamic>>[];
    for (final e in widget.establishments) {
      final selected = e.id == widget.selectedId;
      final url = e.logoUrl;
      if (url != null) _loadLogo(url);
      final logo = url == null ? null : _logos[url];
      final String name;
      if (logo != null) {
        name = _logoPinName(e, selected);
        if (_images.add(name)) {
          final pin = PlacePin(icon: e.categoryIcon, logo: logo, open: e.acceptsOrders, selected: selected);
          await MapImages.add(map, name, MapImages.logoPinSize, () => MapImages.logoPin(pin), _pixelRatio);
        }
      } else {
        name = _pinName(e.categoryIcon, e.acceptsOrders, selected);
        if (_images.add(name)) {
          await MapImages.add(map, name, MapImages.pinSize, () => MapImages.pin(PlacePin(icon: e.categoryIcon, open: e.acceptsOrders, selected: selected)), _pixelRatio);
        }
      }
      features.add({
        'type': 'Feature',
        'id': e.id,
        'properties': {'icon': name, 'sort': selected ? 1 : 0},
        'geometry': {'type': 'Point', 'coordinates': [e.location.lng, e.location.lat]},
      });
    }
    // Llegó una lista más nueva mientras se pintaban los pines: esa manda.
    if (!mounted || _map != map || version != _placesVersion) return;
    await map.setGeoJsonSource(_places, {'type': 'FeatureCollection', 'features': features});
    _frameNearest();
  }

  void _onFeatureTap(String id, String layerId) {
    if (layerId != _places) return;
    final tapped = widget.establishments.where((e) => e.id == id).firstOrNull;
    if (tapped != null) widget.onSelect(tapped);
  }

  /// A las afueras, el local más cercano puede quedar fuera de la vista con zoom 15: se encuadra junto con
  /// el cliente para que no parezca que no hay locales. Una vez por ubicación, para no pelear con el usuario.
  Future<void> _frameNearest() async {
    final map = _map;
    final nearest = widget.establishments.firstOrNull;
    if (map == null || nearest == null || _framedFor == widget.center) return;
    _framedFor = widget.center;
    final visible = await map.getVisibleRegion();
    final p = nearest.location;
    final inside = p.lat >= visible.southwest.latitude &&
        p.lat <= visible.northeast.latitude &&
        p.lng >= visible.southwest.longitude &&
        p.lng <= visible.northeast.longitude;
    if (inside) return;
    final c = widget.center;
    await map.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(math.min(c.lat, p.lat), math.min(c.lng, p.lng)),
          northeast: LatLng(math.max(c.lat, p.lat), math.max(c.lng, p.lng)),
        ),
        left: 72,
        top: 72,
        right: 72,
        bottom: 72,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    _pixelRatio = MediaQuery.devicePixelRatioOf(context);
    return BrandMap(
      center: widget.center,
      tiltToggle: true,
      togglePadding: const EdgeInsets.fromLTRB(12, 60, 12, 12),
      onStyleLoaded: _onStyleLoaded,
      onFeatureTap: _onFeatureTap,
    );
  }
}

/// Gota color chontaduro con el logo del local, o el ícono de la categoría si no tiene logo o no carga
/// (igual que en la web). Con logo, la categoría queda en una insignia: el menú lateral filtra por ella.
/// Apagada si el local no recibe pedidos. El pin se pinta a imagen para MapLibre, así que el logo llega ya
/// descargado ([logo]) y no como URL.
class PlacePin extends StatelessWidget {
  const PlacePin({super.key, required this.icon, required this.open, this.logo, this.selected = false});

  final String icon;
  final ui.Image? logo;
  final bool open;
  final bool selected;

  static const _closed = Color(0xFF6B6875);
  static const _closedInk = Color(0xFFE9E7EE);

  @override
  Widget build(BuildContext context) {
    final background = !open ? _closed : (selected ? AppColors.brand : AppColors.chonta);
    final foreground = !open ? _closedInk : (selected ? AppColors.ink : Colors.white);
    final logo = this.logo;
    final size = logo == null ? 38.0 : 44.0;
    final categoryGlyph = Icon(categoryIcon(icon), size: 18, color: foreground);
    Widget face = categoryGlyph;
    if (logo != null) {
      Widget image = RawImage(image: logo, fit: BoxFit.cover, width: 33, height: 33);
      if (!open) image = Opacity(opacity: 0.75, child: ColorFiltered(colorFilter: _grayscale, child: image));
      face = Container(
        width: 33,
        height: 33,
        clipBehavior: Clip.antiAlias,
        decoration: const BoxDecoration(color: AppColors.cream, shape: BoxShape.circle),
        child: image,
      );
    }
    final pin = Transform.rotate(
      angle: -math.pi / 4,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(size / 2),
            topRight: Radius.circular(size / 2),
            bottomRight: Radius.circular(size / 2),
            bottomLeft: const Radius.circular(5),
          ),
          border: Border.all(color: selected ? AppColors.ink : (open ? Colors.white : foreground), width: 2.5),
          boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 4))],
        ),
        child: Transform.rotate(angle: math.pi / 4, child: Center(child: face)),
      ),
    );
    return AnimatedScale(
      scale: selected ? 1.15 : 1,
      duration: const Duration(milliseconds: 150),
      alignment: Alignment.bottomCenter,
      child: Align(
        alignment: Alignment.topCenter,
        child: logo == null
            ? pin
            : Padding(
                // Espacio para la insignia, que sobresale por la esquina superior derecha.
                padding: const EdgeInsets.only(top: 4),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    pin,
                    Positioned(top: -6, right: -9, child: _CategoryBadge(icon: icon, open: open, selected: selected)),
                  ],
                ),
              ),
      ),
    );
  }
}

class _CategoryBadge extends StatelessWidget {
  const _CategoryBadge({required this.icon, required this.open, required this.selected});

  final String icon;
  final bool open;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final background = !open ? PlacePin._closed : (selected ? AppColors.ink : AppColors.chontaStrong);
    final foreground = !open ? PlacePin._closedInk : (selected ? AppColors.brand : Colors.white);
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: background,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.35), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Icon(categoryIcon(icon), size: 11, color: foreground),
    );
  }
}

/// Escala de grises para el logo de un local que no recibe pedidos.
const _grayscale = ColorFilter.matrix(<double>[
  0.2126, 0.7152, 0.0722, 0, 0, //
  0.2126, 0.7152, 0.0722, 0, 0, //
  0.2126, 0.7152, 0.0722, 0, 0, //
  0, 0, 0, 1, 0,
]);
