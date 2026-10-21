import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../../app/theme.dart';
import '../../../../core/config/env.dart';
import '../../../establishments/domain/entities/establishment.dart';
import '../../../establishments/presentation/widgets/nearby_map.dart' show PlacePin, brandTint;

/// Mapa del domiciliario en su pedido. Rumbo al local: la geocerca dibujada (zona amarilla con borde de
/// chontaduro), donde la llegada se marca sola. Rumbo al cliente: su puerta. El punto de tinta es él mismo,
/// con su propio GPS; esta posición no sale del teléfono hacia el cliente.
class TripMap extends StatelessWidget {
  const TripMap({super.key, required this.store, required this.area, required this.me, this.destination, this.towardsCustomer = false});

  final GeoPoint store;
  final List<GeoPoint> area;
  final GeoPoint? destination;
  final ValueNotifier<GeoPoint?> me;

  /// Ya salió del local: el encuadre va al destino y el área del local se atenúa.
  final bool towardsCustomer;

  static LatLng _ll(GeoPoint p) => LatLng(p.lat, p.lng);

  @override
  Widget build(BuildContext context) {
    final focus = <LatLng>[
      if (towardsCustomer && destination != null) _ll(destination!) else ...[_ll(store), ...area.map(_ll)],
      if (me.value != null) _ll(me.value!),
    ];
    final ring = [for (final p in area) _ll(p)];
    return FlutterMap(
      // Nueva etapa, nuevo encuadre.
      key: ValueKey(towardsCustomer),
      options: MapOptions(
        initialCameraFit: focus.length > 1
            ? CameraFit.bounds(bounds: LatLngBounds.fromPoints(focus), padding: const EdgeInsets.fromLTRB(48, 72, 48, 48), maxZoom: 18)
            : null,
        initialCenter: focus.first,
        initialZoom: 17,
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
      ),
      children: [
        TileLayer(
          urlTemplate: Env.mapTilesUrl,
          userAgentPackageName: 'com.rapichonta.app',
          tileBuilder: (context, tile, _) => ColorFiltered(colorFilter: brandTint, child: tile),
        ),
        if (ring.length >= 3)
          PolygonLayer(polygons: [
            Polygon(
              points: ring,
              color: AppColors.brand.withValues(alpha: towardsCustomer ? 0.12 : 0.32),
              borderColor: towardsCustomer ? AppColors.chonta.withValues(alpha: 0.4) : AppColors.chontaStrong,
              borderStrokeWidth: 3,
              pattern: StrokePattern.dashed(segments: const [10, 6]),
            ),
          ]),
        MarkerLayer(markers: [
          Marker(point: _ll(store), width: 48, height: 52, alignment: Alignment.topCenter, child: const PlacePin(icon: 'store', open: true)),
          if (destination != null) Marker(point: _ll(destination!), width: 48, height: 52, alignment: Alignment.topCenter, child: const _DoorDrop()),
        ]),
        ValueListenableBuilder<GeoPoint?>(
          valueListenable: me,
          builder: (context, point, _) => point == null
              ? const SizedBox.shrink()
              : MarkerLayer(markers: [Marker(point: _ll(point), width: 40, height: 40, child: const _MeDot())]),
        ),
      ],
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
