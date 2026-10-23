import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../../../app/theme.dart';
import '../../../../core/map/brand_map.dart';
import '../../../../core/map/map_images.dart';
import '../../../business/domain/business.dart';
import '../../../business/presentation/coverage_layers.dart';
import '../../../establishments/domain/entities/establishment.dart';
import '../../../establishments/presentation/widgets/nearby_map.dart' show PlacePin;

/// Mapa de entrega (H04.2) con el pin fijo en el centro: el cliente arrastra el mapa hasta su puerta.
/// El pin se levanta mientras el mapa se mueve y cae al soltar; solo entonces se cotiza la zona.
/// Con [interactive] en false es la vista quieta del detalle del pedido. Siempre plano: aquí importa el punto
/// exacto, y con el mapa inclinado se apunta peor.
class DeliveryPinMap extends StatefulWidget {
  const DeliveryPinMap({super.key, required this.center, this.onPick, this.label, this.store, this.controller, this.interactive = true, this.coverage = const []});

  final GeoPoint center;
  final ValueChanged<GeoPoint>? onPick;

  /// Rótulo sobre el pin: tarifa de la zona o el aviso de fuera de cobertura.
  final Widget? label;
  final GeoPoint? store;
  final MapHandle? controller;
  final bool interactive;

  /// Hasta dónde llegamos: el cliente ve el área iluminada donde puede soltar el pin (H03.5).
  final List<CoverageArea> coverage;

  @override
  State<DeliveryPinMap> createState() => _DeliveryPinMapState();
}

class _DeliveryPinMapState extends State<DeliveryPinMap> {
  static const _store = 'rapichonta-store';

  MapLibreMapController? _map;
  bool _moving = false;

  /// Solo un arrastre del cliente elige el punto; los movimientos de la app (su ubicación, el arranque) no.
  bool _touched = false;
  double _pixelRatio = 2;

  @override
  void didUpdateWidget(DeliveryPinMap old) {
    super.didUpdateWidget(old);
    final map = _map;
    if (map != null && old.coverage != widget.coverage) CoverageLayers.update(map, widget.coverage).ignore();
  }

  Future<void> _onStyleLoaded(MapLibreMapController map) async {
    _map = map;
    widget.controller?.attach(map);
    await CoverageLayers.add(map, widget.coverage, dim: 0.22);
    final store = widget.store;
    if (store == null) return;
    await MapImages.add(map, 'pin-store', MapImages.pinSize, () => MapImages.pin(const PlacePin(icon: 'store', open: true)), _pixelRatio);
    await map.addGeoJsonSource(_store, {
      'type': 'FeatureCollection',
      'features': [
        {
          'type': 'Feature',
          'properties': <String, dynamic>{},
          'geometry': {'type': 'Point', 'coordinates': [store.lng, store.lat]},
        },
      ],
    });
    await map.addSymbolLayer(
      _store,
      _store,
      SymbolLayerProperties(iconImage: 'pin-store', iconSize: MapImages.iconSize(_pixelRatio), iconAnchor: 'bottom', iconAllowOverlap: true),
      enableInteraction: false,
    );
  }

  void _onCameraMove(CameraPosition _) {
    if (!widget.interactive || !_touched || _moving) return;
    setState(() => _moving = true);
  }

  void _onCameraIdle(CameraPosition? camera) {
    if (!widget.interactive || !_touched) return;
    _touched = false;
    setState(() => _moving = false);
    if (camera != null) widget.onPick?.call(geoPointOf(camera.target));
  }

  @override
  Widget build(BuildContext context) {
    _pixelRatio = MediaQuery.devicePixelRatioOf(context);
    return Stack(
      children: [
        Listener(
          behavior: HitTestBehavior.translucent,
          onPointerDown: (_) => _touched = true,
          child: BrandMap(
            center: widget.center,
            zoom: 17,
            interactive: widget.interactive,
            onStyleLoaded: _onStyleLoaded,
            onCameraMove: widget.interactive ? _onCameraMove : null,
            onCameraIdle: widget.interactive ? _onCameraIdle : null,
          ),
        ),
        // La sombra marca el punto exacto (centro del mapa); la punta de la gota cae sobre ella.
        IgnorePointer(
          child: Center(
            child: AnimatedScale(
              scale: _moving ? 1.7 : 1,
              duration: const Duration(milliseconds: 180),
              child: Container(
                width: 14,
                height: 5,
                decoration: BoxDecoration(color: AppColors.ink.withValues(alpha: _moving ? 0.18 : 0.35), borderRadius: BorderRadius.circular(9)),
              ),
            ),
          ),
        ),
        IgnorePointer(
          child: Align(
            alignment: Alignment.center,
            child: FractionalTranslation(
              translation: const Offset(0, -0.5),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.label != null)
                    AnimatedOpacity(opacity: _moving ? 0 : 1, duration: const Duration(milliseconds: 150), child: widget.label!),
                  const SizedBox(height: 10),
                  AnimatedSlide(
                    offset: _moving ? const Offset(0, -0.25) : Offset.zero,
                    duration: const Duration(milliseconds: 180),
                    curve: Curves.easeOutBack,
                    child: const _HomeDrop(),
                  ),
                  const SizedBox(height: 4),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Gota de tinta con la casa en amarillo marca: la puerta del cliente (el local es la gota chontaduro).
class _HomeDrop extends StatelessWidget {
  const _HomeDrop();

  @override
  Widget build(BuildContext context) => Transform.rotate(
        angle: -0.785398,
        child: Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: AppColors.ink,
            borderRadius: const BorderRadius.only(topLeft: Radius.circular(23), topRight: Radius.circular(23), bottomRight: Radius.circular(23), bottomLeft: Radius.circular(6)),
            border: Border.all(color: AppColors.brand, width: 3),
            boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.35), blurRadius: 12, offset: const Offset(0, 6))],
          ),
          child: Transform.rotate(angle: 0.785398, child: const Icon(Icons.home_rounded, color: AppColors.brand, size: 22)),
        ),
      );
}
