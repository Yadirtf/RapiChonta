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

/// Cómo va el GPS en este teléfono: si da lecturas y si llegan a la API. La pantalla del turno lo usa para
/// explicar por qué el panel no lo ve (la API dice si lo ve; esto dice dónde se quedó la ubicación).
/// Todas las horas son del reloj del teléfono y solo se comparan con él mismo.
class TrackerHealth {
  const TrackerHealth({this.startedAt, this.lastFixAt, this.lastDeliveredAt, this.lastAcceptedAt, this.error});

  /// Cuándo arrancó el GPS de este turno.
  final DateTime? startedAt;

  /// Última lectura que entregó el GPS.
  final DateTime? lastFixAt;

  /// Último lote que la API recibió.
  final DateTime? lastDeliveredAt;

  /// Último lote del que la API guardó al menos una lectura (descarta simuladas y saltos imposibles).
  final DateTime? lastAcceptedAt;

  /// Código del último error del GPS (permiso, ubicación apagada); se borra con la siguiente lectura.
  final String? error;

  TrackerHealth copyWith({DateTime? lastFixAt, DateTime? lastDeliveredAt, DateTime? lastAcceptedAt, String? error, bool clearError = false}) => TrackerHealth(
        startedAt: startedAt,
        lastFixAt: lastFixAt ?? this.lastFixAt,
        lastDeliveredAt: lastDeliveredAt ?? this.lastDeliveredAt,
        lastAcceptedAt: lastAcceptedAt ?? this.lastAcceptedAt,
        error: clearError ? null : error ?? this.error,
      );
}

/// H08.1 / H08.3: el GPS del domiciliario hacia la API, en lotes.
/// - Una lectura cada ~5 s aunque esté quieto: la llegada al local pide lecturas seguidas dentro del área.
/// - Lote cada 10 s (máx. 50 por envío, como la API). Sin señal se guardan las últimas 200 y salen al volver.
/// - Cada lote lleva la hora del teléfono al enviarlo: la API corrige con ella un reloj mal puesto.
/// - Si el GPS se queda callado (servicio que no arrancó, error, el sistema lo pausó), se vuelve a pedir.
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

  /// Sin lecturas por este tiempo (se piden cada 5 s) el GPS se da por callado y se vuelve a pedir; si sigue
  /// callado (bajo techo sin señal), cada vez se espera el doble, hasta [_maxSilence].
  static const _silence = Duration(seconds: 30);
  static const _maxSilence = Duration(minutes: 2);

  final _buffer = <LocationReading>[];
  StreamSubscription<Position>? _positions;
  Timer? _timer;
  bool _sending = false;
  TrackerNotice? _notice;

  /// Desde cuándo se espera una lectura: el arranque, la última lectura o el último reintento.
  DateTime _waitingSince = DateTime.now();
  Duration _patience = _silence;

  /// Última posición conocida, para dibujar al domiciliario en su propio mapa.
  final position = ValueNotifier<GeoPoint?>(null);

  final health = ValueNotifier<TrackerHealth>(const TrackerHealth());

  bool get running => _timer != null;

  void start(TrackerNotice notice) {
    if (running) return;
    _notice = notice;
    _patience = _silence;
    health.value = TrackerHealth(startedAt: DateTime.now());
    _listen();
    _timer = Timer.periodic(_flushEvery, (_) => _tick());
  }

  void _listen() {
    _waitingSince = DateTime.now();
    _positions = Geolocator.getPositionStream(locationSettings: _settings(_notice!)).listen(
      _onPosition,
      onError: (Object error) => health.value = health.value.copyWith(error: _errorCode(error)),
      // El sistema cerró el flujo (servicio detenido): el próximo tick lo vuelve a pedir.
      onDone: () => _positions = null,
    );
  }

  Future<void> _tick() async {
    if (_positions == null || DateTime.now().difference(_waitingSince) > _patience) {
      // Un flujo que no entrega nada no avisa: el servicio en primer plano pudo no enlazarse a tiempo o el
      // sistema pausó el GPS. Pedirlo de nuevo es barato y lo despierta.
      await _positions?.cancel();
      if (!running) return;
      _patience = _patience * 2 > _maxSilence ? _maxSilence : _patience * 2;
      _listen();
    }
    await flush();
  }

  Future<void> stop() async {
    _timer?.cancel();
    _timer = null;
    await _positions?.cancel();
    _positions = null;
    // Lo que quedó en el lote todavía sirve (cierra el recorrido); si no sale, se pierde sin daño.
    await flush();
    _buffer.clear();
  }

  void dispose() {
    unawaited(stop());
    position.dispose();
    health.dispose();
  }

  void _onPosition(Position p) {
    final point = GeoPoint(p.latitude, p.longitude);
    position.value = point;
    _waitingSince = DateTime.now();
    _patience = _silence;
    health.value = health.value.copyWith(lastFixAt: _waitingSince, clearError: true);
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
        if (running) {
          final at = DateTime.now();
          health.value = health.value.copyWith(lastDeliveredAt: at, lastAcceptedAt: result.accepted > 0 ? at : null);
        }
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

  static String _errorCode(Object error) => switch (error) {
        PermissionDeniedException() => 'PERMISSION_DENIED',
        LocationServiceDisabledException() => 'SERVICE_DISABLED',
        _ => 'GPS_ERROR',
      };

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
