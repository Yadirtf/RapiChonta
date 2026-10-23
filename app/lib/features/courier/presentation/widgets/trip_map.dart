import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../../../app/theme.dart';
import '../../../../core/map/brand_map.dart';
import '../../../../core/map/map_images.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../business/presentation/coverage_layers.dart' show geoJsonRing;
import '../../../establishments/domain/entities/establishment.dart';
import '../../../establishments/presentation/widgets/nearby_map.dart' show PlacePin;
import '../../domain/courier.dart';
import '../../domain/route_progress.dart';
import '../courier_providers.dart';

/// Mapa del domiciliario en su pedido. Rumbo al local: la geocerca dibujada (zona amarilla con borde de
/// chontaduro), donde la llegada se marca sola. Rumbo al cliente: su puerta. El punto de tinta es él mismo,
/// con su propio GPS; esta posición no sale del teléfono hacia el cliente. Encima, la ruta por las calles con
/// lo que falta (distancia y minutos) y el modo "Navegar": el mapa lo sigue, inclinado y girado hacia donde va.
class TripMap extends ConsumerStatefulWidget {
  const TripMap({super.key, required this.code, required this.store, required this.area, required this.me, this.destination, this.towardsCustomer = false});

  final String code;
  final GeoPoint store;
  final List<GeoPoint> area;
  final GeoPoint? destination;
  final ValueNotifier<GeoPoint?> me;

  /// Ya salió del local: el encuadre va al destino y el área del local se atenúa.
  final bool towardsCustomer;

  @override
  ConsumerState<TripMap> createState() => _TripMapState();
}

class _TripMapState extends ConsumerState<TripMap> {
  static const _area = 'rapichonta-store-area';
  static const _places = 'rapichonta-trip-places';
  static const _me = 'rapichonta-trip-me';
  static const _route = 'rapichonta-route';

  /// Más lejos que esto de la línea es que tomó otro camino: se pide una ruta nueva.
  static const _offRouteMeters = 40.0;

  /// Entre dos pedidos de ruta (el GPS da una lectura cada ~5 s); si el servicio no respondió, se espera más.
  static const _minInterval = Duration(seconds: 20);
  static const _retryInterval = Duration(minutes: 1);

  final _handle = MapHandle();
  MapLibreMapController? _map;
  double _pixelRatio = 2;

  TripRoute? _tripRoute;
  DateTime? _askedAt;
  bool _asking = false;
  bool _failed = false;

  bool _navigating = false;
  GeoPoint? _lastFix;
  double _bearing = 0;

  @override
  void initState() {
    super.initState();
    widget.me.addListener(_onMove);
  }

  @override
  void didUpdateWidget(TripMap old) {
    super.didUpdateWidget(old);
    if (old.me != widget.me) {
      old.me.removeListener(_onMove);
      widget.me.addListener(_onMove);
      _onMove();
    }
    final map = _map;
    if (old.towardsCustomer != widget.towardsCustomer || old.code != widget.code) {
      // Nueva etapa: la ruta vieja ya no sirve.
      _tripRoute = null;
      _askedAt = null;
      _askRoute();
    }
    if (map == null) return;
    if (old.destination != widget.destination || old.store != widget.store) map.setGeoJsonSource(_places, _placesData()).ignore();
    if (old.area != widget.area) map.setGeoJsonSource(_area, _areaData()).ignore();
    if (old.towardsCustomer != widget.towardsCustomer) {
      map.setLayerProperties('$_area-fill', _areaFill()).ignore();
      map.setLayerProperties('$_area-line', _areaLine()).ignore();
      map.setGeoJsonSource(_route, _routeData()).ignore();
      if (!_navigating) _frame();
    }
  }

  @override
  void dispose() {
    widget.me.removeListener(_onMove);
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

  Map<String, dynamic> _routeData() {
    final route = _tripRoute;
    return {
      'type': 'FeatureCollection',
      'features': [
        if (route != null && route.line.length >= 2)
          {
            'type': 'Feature',
            'properties': <String, dynamic>{},
            'geometry': {
              'type': 'LineString',
              'coordinates': [for (final p in route.line) [p.lng, p.lat]],
            },
          },
      ],
    };
  }

  FillLayerProperties _areaFill() => FillLayerProperties(fillColor: mapColor(AppColors.brand.withValues(alpha: widget.towardsCustomer ? 0.12 : 0.32)));

  LineLayerProperties _areaLine() => LineLayerProperties(
        lineColor: mapColor(widget.towardsCustomer ? AppColors.chonta.withValues(alpha: 0.4) : AppColors.chontaStrong),
        lineWidth: 3,
        // Raya de 10 y espacio de 6 puntos, en unidades del grosor (3).
        lineDasharray: [3.3, 2],
      );

  void _onMove() {
    final me = widget.me.value;
    _map?.setGeoJsonSource(_me, _meData()).ignore();
    if (me == null) return;
    // Rumbo con el desplazamiento real (el del GPS quieto da vueltas): solo si avanzó unos metros.
    final last = _lastFix;
    if (last == null || metersBetween(last, me) >= 4) {
      if (last != null) _bearing = bearingBetween(last, me);
      _lastFix = me;
    }
    if (_navigating) _follow();
    _askRoute();
    // Lo que falta se recalcula sobre la línea en cada lectura, sin pedir nada a la red.
    if (_tripRoute != null && mounted) setState(() {});
  }

  /// Pide la ruta la primera vez, al cambiar de etapa y cuando se sale de ella.
  Future<void> _askRoute() async {
    final me = widget.me.value;
    if (me == null || _asking) return;
    final route = _tripRoute;
    final needed = route == null || route.towardsCustomer != widget.towardsCustomer || progressOnRoute(me, route.line).offRoute > _offRouteMeters;
    final wait = _failed ? _retryInterval : _minInterval;
    if (!needed || (_askedAt != null && DateTime.now().difference(_askedAt!) < wait)) return;
    _asking = true;
    _askedAt = DateTime.now();
    try {
      final fresh = await ref.read(courierRepositoryProvider).route(widget.code, me);
      if (!mounted) return;
      _failed = fresh == null;
      if (fresh != null && fresh.towardsCustomer != widget.towardsCustomer) return;
      setState(() => _tripRoute = fresh);
      _map?.setGeoJsonSource(_route, _routeData()).ignore();
    } catch (_) {
      // Sin señal: se sigue con la última ruta y se vuelve a intentar en un rato.
      _failed = true;
    } finally {
      _asking = false;
    }
  }

  Future<void> _onStyleLoaded(MapLibreMapController map) async {
    _map = map;
    final size = MapImages.iconSize(_pixelRatio);
    await MapImages.add(map, 'trip-store', MapImages.pinSize, () => MapImages.pin(const PlacePin(icon: 'store', open: true)), _pixelRatio);
    await MapImages.add(map, 'trip-door', MapImages.pinSize, () => MapImages.pin(const _DoorDrop()), _pixelRatio);
    await MapImages.add(map, 'trip-me', const Size(40, 40), () => const _MeDot(), _pixelRatio);
    await map.addGeoJsonSource(_area, _areaData());
    await map.addFillLayer(_area, '$_area-fill', _areaFill(), enableInteraction: false);
    await map.addLineLayer(_area, '$_area-line', _areaLine(), enableInteraction: false);
    // La ruta: tinta sobre un borde blanco, debajo de los pines.
    await map.addGeoJsonSource(_route, _routeData());
    await map.addLineLayer(
      _route,
      '$_route-casing',
      const LineLayerProperties(lineColor: '#ffffff', lineWidth: 9, lineCap: 'round', lineJoin: 'round'),
      enableInteraction: false,
    );
    await map.addLineLayer(
      _route,
      _route,
      LineLayerProperties(lineColor: mapColor(AppColors.chontaStrong), lineWidth: 5, lineCap: 'round', lineJoin: 'round'),
      enableInteraction: false,
    );
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
    if (_navigating) {
      _follow();
    } else {
      _frame();
    }
    _askRoute();
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

  /// Vista de navegación: él un poco abajo del centro, el mapa inclinado y girado hacia donde va.
  void _follow() {
    final me = widget.me.value;
    if (me == null) return;
    _map
        ?.animateCamera(
          CameraUpdate.newCameraPosition(CameraPosition(target: latLngOf(me), zoom: 17.5, tilt: tilt3d, bearing: _bearing)),
          duration: const Duration(milliseconds: 900),
        )
        .ignore();
  }

  Future<void> _toggleNavigation() async {
    setState(() => _navigating = !_navigating);
    final map = _map;
    if (map == null) return;
    if (_navigating) {
      // Más abajo en la pantalla: se ve más camino por delante.
      await map.setPadding(top: 160).catchError((_) {});
      _follow();
      return;
    }
    await map.setPadding().catchError((_) {});
    await map.animateCamera(CameraUpdate.bearingTo(0));
    _frame();
    await map.animateCamera(CameraUpdate.tiltTo(_handle.tilted ? tilt3d : 0));
  }

  @override
  Widget build(BuildContext context) {
    _pixelRatio = MediaQuery.devicePixelRatioOf(context);
    final l10n = AppLocalizations.of(context);
    final route = _tripRoute;
    final me = widget.me.value;
    final progress = route == null || me == null ? null : progressOnRoute(me, route.line);
    return Stack(
      children: [
        BrandMap(
          center: _focus.first,
          zoom: 17,
          handle: _handle,
          tiltToggle: !_navigating,
          toggleAlignment: Alignment.bottomRight,
          onStyleLoaded: _onStyleLoaded,
        ),
        if (route != null && progress != null)
          Positioned(
            left: 0,
            right: 0,
            bottom: 14,
            child: Center(child: _RouteLeft(meters: progress.remaining, seconds: route.durationSeconds * progress.remaining / math.max(route.distanceMeters, 1))),
          ),
        Positioned(
          right: 12,
          bottom: _navigating ? 12 : 68,
          child: Material(
            color: _navigating ? AppColors.ink : Colors.white,
            borderRadius: BorderRadius.circular(99),
            elevation: 3,
            child: InkWell(
              borderRadius: BorderRadius.circular(99),
              onTap: _toggleNavigation,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(_navigating ? Icons.map_rounded : Icons.navigation_rounded, size: 18, color: _navigating ? AppColors.brand : AppColors.chonta),
                  const SizedBox(width: 6),
                  Text(
                    _navigating ? l10n.tripOverview : l10n.tripNavigate,
                    style: TextStyle(fontWeight: FontWeight.w800, color: _navigating ? AppColors.brand : AppColors.ink),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Lo que falta por la ruta: "1,2 km · 4 min".
class _RouteLeft extends StatelessWidget {
  const _RouteLeft({required this.meters, required this.seconds});

  final double meters;
  final double seconds;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final distance = meters < 1000
        ? '${(meters / 10).round() * 10} m'
        : '${NumberFormat.decimalPatternDigits(locale: locale, decimalDigits: 1).format(meters / 1000)} km';
    final minutes = math.max(1, (seconds / 60).round());
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.ink,
        borderRadius: BorderRadius.circular(99),
        boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.3), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.route_rounded, size: 16, color: AppColors.brand),
        const SizedBox(width: 6),
        Text(l10n.tripRouteLeft(distance, minutes), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ]),
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
