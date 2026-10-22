import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/location_tracker.dart';
import '../../domain/courier.dart';
import '../courier_providers.dart';

/// Dónde se quedó la ubicación que el panel no está recibiendo.
enum LocationProblem {
  /// El GPS del teléfono no entrega lecturas (apagado, bajo techo, ahorro de batería).
  noFix,

  /// Hay lecturas pero no llegan a la API (sin datos o sin wifi).
  notDelivered,

  /// Llegan pero la API no guarda ninguna (ubicación simulada o lecturas imposibles).
  rejected,
}

/// Lo que se le explica al domiciliario cuando la API dice que su ubicación no está fresca. La API decide si
/// hay problema (es lo que mira el panel); el teléfono sabe en qué paso se quedó. Recién arrancado el turno se
/// espera [grace] antes de alarmar, y una lectura de hace menos de [stale] cuenta como reciente.
LocationProblem? locationProblem(
  CourierStatus status,
  TrackerHealth health,
  DateTime now, {
  Duration grace = const Duration(seconds: 45),
  Duration stale = const Duration(seconds: 60),
}) {
  if (!status.tracking || status.locationFresh) return null;
  final startedAt = health.startedAt;
  if (startedAt == null || now.difference(startedAt) < grace) return null;
  bool recent(DateTime? at) => at != null && now.difference(at) < stale;
  if (!recent(health.lastFixAt)) return LocationProblem.noFix;
  if (!recent(health.lastDeliveredAt)) return LocationProblem.notDelivered;
  if (!recent(health.lastAcceptedAt)) return LocationProblem.rejected;
  // Ya entrega y la API ya guarda: el estado de la API se pone al día en su próxima consulta.
  return null;
}

/// Aviso del turno cuando el panel no lo ve: sin ubicación reciente no le llegan pedidos.
class LocationSignalBanner extends ConsumerStatefulWidget {
  const LocationSignalBanner({super.key, required this.status});

  final CourierStatus status;

  @override
  ConsumerState<LocationSignalBanner> createState() => _LocationSignalBannerState();
}

class _LocationSignalBannerState extends ConsumerState<LocationSignalBanner> {
  // El estado de la API se refresca cada 30 s; esto vuelve a mirar el GPS entre consultas.
  late final Timer _clock;

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(seconds: 10), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _clock.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final tracker = ref.watch(locationTrackerProvider);
    return ValueListenableBuilder<TrackerHealth>(
      valueListenable: tracker.health,
      builder: (context, health, _) {
        final problem = locationProblem(widget.status, health, DateTime.now());
        if (problem == null) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(color: AppColors.chontaSoft, borderRadius: BorderRadius.circular(18)),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.wrong_location_rounded, color: AppColors.chontaStrong),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.courierLocationNotReachingTitle,
                        style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.chontaStrong),
                      ),
                      const SizedBox(height: 2),
                      Text(switch (problem) {
                        LocationProblem.noFix => l10n.courierLocationNoFix,
                        LocationProblem.notDelivered => l10n.courierLocationNotDelivered,
                        LocationProblem.rejected => l10n.courierLocationRejected,
                      }),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
