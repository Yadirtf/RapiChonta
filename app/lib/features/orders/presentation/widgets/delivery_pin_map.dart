import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../../app/theme.dart';
import '../../../../core/config/env.dart';
import '../../../establishments/domain/entities/establishment.dart';
import '../../../establishments/presentation/widgets/nearby_map.dart' show PlacePin, brandTint;

/// Mapa de entrega (H04.2) con el pin fijo en el centro: el cliente arrastra el mapa hasta su puerta.
/// El pin se levanta mientras el mapa se mueve y cae al soltar; solo entonces se cotiza la zona.
/// Con [interactive] en false es la vista quieta del detalle del pedido.
class DeliveryPinMap extends StatefulWidget {
  const DeliveryPinMap({super.key, required this.center, this.onPick, this.label, this.store, this.controller, this.interactive = true});

  final GeoPoint center;
  final ValueChanged<GeoPoint>? onPick;

  /// Rótulo sobre el pin: tarifa de la zona o el aviso de fuera de cobertura.
  final Widget? label;
  final GeoPoint? store;
  final MapController? controller;
  final bool interactive;

  @override
  State<DeliveryPinMap> createState() => _DeliveryPinMapState();
}

class _DeliveryPinMapState extends State<DeliveryPinMap> {
  bool _moving = false;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        FlutterMap(
          mapController: widget.controller,
          options: MapOptions(
            initialCenter: LatLng(widget.center.lat, widget.center.lng),
            initialZoom: 17,
            interactionOptions: InteractionOptions(flags: widget.interactive ? InteractiveFlag.all & ~InteractiveFlag.rotate : InteractiveFlag.none),
            onMapEvent: (event) {
              if (!widget.interactive) return;
              if (event is MapEventMoveStart || event is MapEventFlingAnimationStart) {
                if (!_moving) setState(() => _moving = true);
              } else if (event is MapEventMoveEnd || event is MapEventFlingAnimationEnd || event is MapEventFlingAnimationNotStarted) {
                setState(() => _moving = false);
                widget.onPick?.call(GeoPoint(event.camera.center.latitude, event.camera.center.longitude));
              }
            },
          ),
          children: [
            TileLayer(
              urlTemplate: Env.mapTilesUrl,
              userAgentPackageName: 'com.rapichonta.app',
              tileBuilder: (context, tile, _) => ColorFiltered(colorFilter: brandTint, child: tile),
            ),
            if (widget.store != null)
              MarkerLayer(markers: [
                Marker(
                  point: LatLng(widget.store!.lat, widget.store!.lng),
                  width: 48,
                  height: 52,
                  alignment: Alignment.topCenter,
                  child: const PlacePin(icon: 'store', open: true),
                ),
              ]),
          ],
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
