import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../../app/theme.dart';
import '../../../../core/config/env.dart';
import '../../domain/entities/establishment.dart';
import 'category_icon.dart';

class NearbyMap extends StatelessWidget {
  const NearbyMap({super.key, required this.center, required this.establishments, required this.onSelect, this.selectedId});

  final GeoPoint center;
  final List<Establishment> establishments;
  final ValueChanged<Establishment> onSelect;
  final String? selectedId;

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      options: MapOptions(initialCenter: LatLng(center.lat, center.lng), initialZoom: 15),
      children: [
        TileLayer(
          urlTemplate: Env.mapTilesUrl,
          userAgentPackageName: 'com.rapichonta.app',
          // Mismas calles de OSM, con colores más cálidos y vivos (en línea con la paleta de la web).
          tileBuilder: (context, tile, _) => ColorFiltered(colorFilter: _brandTint, child: tile),
        ),
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
            for (final e in establishments)
              Marker(
                point: LatLng(e.location.lat, e.location.lng),
                width: 48,
                height: 52,
                alignment: Alignment.topCenter,
                child: Semantics(
                  button: true,
                  label: e.name,
                  child: GestureDetector(onTap: () => onSelect(e), child: PlacePin(icon: e.categoryIcon, open: e.acceptsOrders, selected: e.id == selectedId)),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// Saturación ×1,25 (verdes y ríos más vivos) y un toque cálido: el fondo gris de OSM queda crema.
const _brandTint = ColorFilter.matrix(<double>[
  1.1969, -0.1788, -0.0181, 0, 4, //
  -0.0524, 1.0551, -0.0178, 0, 0, //
  -0.0505, -0.1699, 1.1704, 0, 0, //
  0, 0, 0, 1, 0,
]);

/// Gota color chontaduro con el ícono de la categoría (igual que en la web y que el logo).
/// Apagada si el local no recibe pedidos.
class PlacePin extends StatelessWidget {
  const PlacePin({super.key, required this.icon, required this.open, this.selected = false});

  final String icon;
  final bool open;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final background = !open ? const Color(0xFF6B6875) : (selected ? AppColors.brand : AppColors.chonta);
    final foreground = !open ? const Color(0xFFE9E7EE) : (selected ? AppColors.ink : Colors.white);
    return AnimatedScale(
      scale: selected ? 1.15 : 1,
      duration: const Duration(milliseconds: 150),
      alignment: Alignment.bottomCenter,
      child: Align(
        alignment: Alignment.topCenter,
        child: Transform.rotate(
          angle: -math.pi / 4,
          child: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: background,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(19),
                topRight: Radius.circular(19),
                bottomRight: Radius.circular(19),
                bottomLeft: Radius.circular(5),
              ),
              border: Border.all(color: selected ? AppColors.ink : (open ? Colors.white : foreground), width: 2.5),
              boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 4))],
            ),
            child: Transform.rotate(angle: math.pi / 4, child: Icon(categoryIcon(icon), size: 18, color: foreground)),
          ),
        ),
      ),
    );
  }
}
