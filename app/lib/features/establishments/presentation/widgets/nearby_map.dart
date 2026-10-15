import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../../app/theme.dart';
import '../../../../core/config/env.dart';
import '../../domain/entities/establishment.dart';

class NearbyMap extends StatelessWidget {
  const NearbyMap({super.key, required this.center, required this.establishments, required this.onSelect});

  final GeoPoint center;
  final List<Establishment> establishments;
  final ValueChanged<Establishment> onSelect;

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      options: MapOptions(initialCenter: LatLng(center.lat, center.lng), initialZoom: 15),
      children: [
        TileLayer(urlTemplate: Env.mapTilesUrl, userAgentPackageName: 'com.rapichonta.app'),
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
                width: 40,
                height: 40,
                child: GestureDetector(
                  onTap: () => onSelect(e),
                  child: CircleAvatar(
                    backgroundColor: AppColors.ink,
                    child: Text(
                      e.name.characters.first,
                      style: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
