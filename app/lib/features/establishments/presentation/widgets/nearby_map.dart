import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../../app/theme.dart';
import '../../../../core/config/env.dart';
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
  final _controller = MapController();
  bool _ready = false;
  GeoPoint? _framedFor;

  @override
  void didUpdateWidget(NearbyMap old) {
    super.didUpdateWidget(old);
    if (old.center != widget.center) _framedFor = null;
    _frameNearest();
  }

  /// A las afueras, el local más cercano puede quedar fuera de la vista con zoom 15: se encuadra junto con
  /// el cliente para que no parezca que no hay locales. Una vez por ubicación, para no pelear con el usuario.
  void _frameNearest() {
    final nearest = widget.establishments.firstOrNull;
    if (!_ready || nearest == null || _framedFor == widget.center) return;
    _framedFor = widget.center;
    final point = LatLng(nearest.location.lat, nearest.location.lng);
    if (_controller.camera.visibleBounds.contains(point)) return;
    _controller.fitCamera(
      CameraFit.coordinates(
        coordinates: [LatLng(widget.center.lat, widget.center.lng), point],
        padding: const EdgeInsets.all(72),
        maxZoom: 15,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final center = widget.center;
    return FlutterMap(
      mapController: _controller,
      options: MapOptions(
        initialCenter: LatLng(center.lat, center.lng),
        initialZoom: 15,
        onMapReady: () {
          _ready = true;
          _frameNearest();
        },
      ),
      children: [
        TileLayer(
          urlTemplate: Env.mapTilesUrl,
          userAgentPackageName: 'com.rapichonta.app',
          // Mismas calles de OSM, con colores más cálidos y vivos (en línea con la paleta de la web).
          tileBuilder: (context, tile, _) => ColorFiltered(colorFilter: brandTint, child: tile),
        ),
        ...coverageLayers(widget.coverage),
        MarkerLayer(
          markers: [
            Marker(
              point: LatLng(center.lat, center.lng),
              width: 22,
              height: 22,
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.blue,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 3),
                ),
              ),
            ),
            for (final e in widget.establishments)
              Marker(
                point: LatLng(e.location.lat, e.location.lng),
                // Con logo, la gota es más grande y lleva la insignia de la categoría.
                width: e.logoUrl == null ? 48 : 64,
                height: e.logoUrl == null ? 52 : 62,
                alignment: Alignment.topCenter,
                child: Semantics(
                  button: true,
                  label: e.name,
                  child: GestureDetector(
                    onTap: () => widget.onSelect(e),
                    child: PlacePin(icon: e.categoryIcon, logoUrl: e.logoUrl, open: e.acceptsOrders, selected: e.id == widget.selectedId),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// Saturación ×1,25 (verdes y ríos más vivos) y un toque cálido: el fondo gris de OSM queda crema.
const brandTint = ColorFilter.matrix(<double>[
  1.1969, -0.1788, -0.0181, 0, 4, //
  -0.0524, 1.0551, -0.0178, 0, 0, //
  -0.0505, -0.1699, 1.1704, 0, 0, //
  0, 0, 0, 1, 0,
]);

/// Gota color chontaduro con el logo del local, o el ícono de la categoría si no tiene logo o no carga
/// (igual que en la web). Con logo, la categoría queda en una insignia: el menú lateral filtra por ella.
/// Apagada si el local no recibe pedidos.
class PlacePin extends StatelessWidget {
  const PlacePin({super.key, required this.icon, required this.open, this.logoUrl, this.selected = false});

  final String icon;
  final String? logoUrl;
  final bool open;
  final bool selected;

  static const _closed = Color(0xFF6B6875);
  static const _closedInk = Color(0xFFE9E7EE);

  @override
  Widget build(BuildContext context) {
    final background = !open ? _closed : (selected ? AppColors.brand : AppColors.chonta);
    final foreground = !open ? _closedInk : (selected ? AppColors.ink : Colors.white);
    final logo = logoUrl;
    final size = logo == null ? 38.0 : 44.0;
    final categoryGlyph = Icon(categoryIcon(icon), size: 18, color: foreground);
    Widget face = categoryGlyph;
    if (logo != null) {
      Widget image = Image.network(
        logo,
        fit: BoxFit.cover,
        width: 33,
        height: 33,
        errorBuilder: (_, _, _) => ColoredBox(color: background, child: Center(child: categoryGlyph)),
      );
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
