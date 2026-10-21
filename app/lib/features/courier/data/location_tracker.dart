import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../../../app/theme.dart';
import '../../../core/error/failure.dart';
import '../../establishments/domain/entities/establishment.dart';
import '../domain/courier.dart';

enum LocationAccess { granted, denied, deniedForever, serviceOff }

/// Permiso de ubicación del sistema. "Mientras se usa la app" basta: el servicio en primer plano (con su
/// notificación fija) mantiene el GPS encendido con la pantalla apagada.
Future<LocationAccess> locationAccess({bool request = false}) async {
  if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceOff;
  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied && request) permission = await Geolocator.requestPermission();
  return switch (permission) {
    LocationPermission.always || LocationPermission.whileInUse => LocationAccess.granted,
    LocationPermission.deniedForever => LocationAccess.deniedForever,
    _ => LocationAccess.denied,
  };
}

/// Texto de la notificación fija de Android, en el idioma de la app.
typedef TrackerNotice = ({String title, String body});

/// H08.1 / H08.3: el GPS del domiciliario hacia la API, en lotes.
/// - Una lectura cada ~5 s aunque esté quieto: la llegada al local pide lecturas seguidas dentro del área.
/// - Lote cada 10 s (máx. 50 por envío, como la API). Sin señal se guardan las últimas 200 y salen al volver.
/// - Marca las lecturas de apps de ubicación simulada: la API las descarta.
/// - El teléfono no decide llegadas: si la API marca una, se avisa con [onArrival].
class LocationTracker {
  LocationTracker({required CourierRepository repository, required this.onArrival, required this.onStopped}) : _repository = repository;

  final CourierRepository _repository;
  final void Function(({String orderCode, String status}) arrival) onArrival;

  /// La API ya no espera ubicación (no está disponible ni lleva pedido).
  final VoidCallback onStopped;

  static const _flushEvery = Duration(seconds: 10);
  static const _batch = 50;
  static const _keep = 200;

  final _buffer = <LocationReading>[];
  StreamSubscription<Position>? _positions;
  Timer? _timer;
  bool _sending = false;

  /// Última posición conocida, para dibujar al domiciliario en su propio mapa.
  final position = ValueNotifier<GeoPoint?>(null);

  bool get running => _positions != null;

  void start(TrackerNotice notice) {
    if (running) return;
    _positions = Geolocator.getPositionStream(locationSettings: _settings(notice)).listen(_onPosition, onError: (Object _) {});
    _timer = Timer.periodic(_flushEvery, (_) => flush());
  }

  Future<void> stop() async {
    await _positions?.cancel();
    _positions = null;
    _timer?.cancel();
    _timer = null;
    // Lo que quedó en el lote todavía sirve (cierra el recorrido); si no sale, se pierde sin daño.
    await flush();
    _buffer.clear();
  }

  void dispose() {
    unawaited(stop());
    position.dispose();
  }

  void _onPosition(Position p) {
    final point = GeoPoint(p.latitude, p.longitude);
    position.value = point;
    _buffer.add(LocationReading(point: point, recordedAt: p.timestamp, accuracyM: p.accuracy, mocked: p.isMocked));
    if (_buffer.length > _keep) _buffer.removeRange(0, _buffer.length - _keep);
    if (_buffer.length >= _batch) unawaited(flush());
  }

  Future<void> flush() async {
    if (_sending || _buffer.isEmpty) return;
    _sending = true;
    try {
      while (_buffer.isNotEmpty) {
        final batch = _buffer.take(_batch).toList();
        final result = await _repository.reportLocations(batch);
        _buffer.removeRange(0, batch.length);
        if (result.arrival != null) onArrival(result.arrival!);
      }
    } on Failure catch (error) {
      if (error.code == 'LOCATION_NOT_EXPECTED') {
        _buffer.clear();
        onStopped();
      } else if (error.code == 'VALIDATION_FAILED') {
        // Un lote que la API no acepta no se reintenta (no se arreglaría solo).
        _buffer.clear();
      }
      // Sin red o servidor caído: el lote espera el siguiente intento.
    } finally {
      _sending = false;
    }
  }

  static LocationSettings _settings(TrackerNotice notice) {
    if (kIsWeb) return const LocationSettings(accuracy: LocationAccuracy.high);
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => AndroidSettings(
          accuracy: LocationAccuracy.high,
          intervalDuration: const Duration(seconds: 5),
          foregroundNotificationConfig: ForegroundNotificationConfig(
            notificationTitle: notice.title,
            notificationText: notice.body,
            notificationIcon: const AndroidResource(name: 'ic_launcher', defType: 'mipmap'),
            color: AppColors.brand,
            enableWakeLock: true,
            setOngoing: true,
          ),
        ),
      TargetPlatform.iOS => AppleSettings(
          accuracy: LocationAccuracy.high,
          activityType: ActivityType.automotiveNavigation,
          pauseLocationUpdatesAutomatically: false,
          showBackgroundLocationIndicator: true,
        ),
      _ => const LocationSettings(accuracy: LocationAccuracy.high),
    };
  }
}
