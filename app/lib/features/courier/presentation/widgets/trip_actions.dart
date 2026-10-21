import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../establishments/domain/entities/establishment.dart';

/// Llamar y abrir la ruta en la app de mapas del teléfono (Google Maps, Petal Maps en Huawei, Apple Maps).

Future<bool> callPhone(String phone) => launchUrl(Uri(scheme: 'tel', path: phone));

Future<bool> openDirections(GeoPoint to, String label) {
  final at = '${to.lat},${to.lng}';
  final uri = switch (kIsWeb ? null : defaultTargetPlatform) {
    // geo: lo abre cualquier app de mapas instalada, también sin servicios de Google.
    TargetPlatform.android => Uri.parse('geo:$at?q=$at(${Uri.encodeComponent(label)})'),
    TargetPlatform.iOS => Uri.https('maps.apple.com', '/', {'daddr': at, 'q': label}),
    _ => Uri.https('www.openstreetmap.org', '/directions', {'route': ';$at'}),
  };
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
