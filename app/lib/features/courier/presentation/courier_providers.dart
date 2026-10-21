import 'dart:async';
import 'dart:ui';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/failure.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/data/storage/session_storage.dart' show uuidV4;
import '../../auth/domain/entities/account.dart';
import '../../auth/presentation/providers/auth_providers.dart';
import '../data/courier_repository_impl.dart';
import '../data/location_tracker.dart';
import '../data/pending_steps_store.dart';
import '../domain/courier.dart';
import '../domain/pending_steps.dart';

final courierRepositoryProvider = Provider<CourierRepository>(
  (ref) => CourierRepositoryImpl(
    authed: ref.watch(authedDioProvider),
    upload: Dio(BaseOptions(connectTimeout: const Duration(seconds: 15), sendTimeout: const Duration(seconds: 60))),
  ),
);

/// La sesión está en modo domiciliario.
final courierModeProvider = Provider<bool>((ref) => ref.watch(sessionProvider.select((s) => s.value?.activeRole == Role.courier)));

/// Estado del turno. Null fuera del modo domiciliario. Se vuelve a pedir cada 30 s: la API cierra la
/// disponibilidad sola si el teléfono deja de reportar, y el pedido puede terminar (entregado, cancelado).
class CourierStatusController extends AsyncNotifier<CourierStatus?> {
  @override
  Future<CourierStatus?> build() async {
    if (!ref.watch(courierModeProvider)) return null;
    final timer = Timer(const Duration(seconds: 30), ref.invalidateSelf);
    ref.onDispose(timer.cancel);
    return ref.watch(courierRepositoryProvider).status();
  }

  Future<void> setAvailable(bool available) async {
    state = AsyncData(await ref.read(courierRepositoryProvider).setAvailable(available));
  }
}

final courierStatusProvider = AsyncNotifierProvider<CourierStatusController, CourierStatus?>(CourierStatusController.new);

/// Permiso de ubicación del sistema; se vuelve a mirar al volver de los ajustes o tras pedirlo.
final locationAccessProvider = FutureProvider<LocationAccess>((ref) => locationAccess());

/// Ofertas abiertas mientras está disponible y sin pedido. Llegan también por push; esto cubre al teléfono
/// sin servicio push o con los avisos apagados.
final courierOffersProvider = FutureProvider.autoDispose.family<List<CourierOffer>, String>((ref, language) async {
  final status = ref.watch(courierStatusProvider).value;
  if (status == null || !status.available || status.activeOrder != null) return const [];
  final timer = Timer(const Duration(seconds: 8), ref.invalidateSelf);
  ref.onDispose(timer.cancel);
  return ref.watch(courierRepositoryProvider).offers(language: language);
});

/// El pedido en curso. Mientras exista se refresca cada 15 s (las llegadas las marca el servidor).
final courierTripProvider = FutureProvider.autoDispose.family<Trip?, String>((ref, language) async {
  if (!ref.watch(courierModeProvider)) return null;
  final trip = await ref.watch(courierRepositoryProvider).trip(language: language);
  if (trip != null) {
    final timer = Timer(const Duration(seconds: 15), ref.invalidateSelf);
    ref.onDispose(timer.cancel);
  }
  return trip;
});

final locationTrackerProvider = Provider<LocationTracker>((ref) {
  final tracker = LocationTracker(
    repository: ref.watch(courierRepositoryProvider),
    onArrival: (_) {
      ref.invalidate(courierTripProvider);
      ref.invalidate(courierStatusProvider);
    },
    onStopped: () => ref.invalidate(courierStatusProvider),
  );
  ref.onDispose(tracker.dispose);
  return tracker;
});

/// El turno en marcha: se observa desde la raíz de la app para que el GPS siga con cualquier pantalla abierta.
/// Reporta la ubicación mientras esté disponible o con pedido (y haya permiso); si no, la apaga.
final courierShiftProvider = Provider<void>((ref) {
  final tracking = ref.watch(courierStatusProvider.select((s) => s.value?.tracking ?? false));
  final granted = ref.watch(locationAccessProvider.select((a) => a.value == LocationAccess.granted));
  final tracker = ref.watch(locationTrackerProvider);
  // La cola sin señal arranca con el modo domiciliario (puede tener pasos de antes de cerrar la app).
  if (ref.watch(courierModeProvider)) ref.watch(pendingStepsProvider);
  if (tracking && granted) {
    final l10n = lookupAppLocalizations(Locale(ref.watch(localeControllerProvider)?.languageCode ?? 'es'));
    tracker.start((title: l10n.courierTrackingTitle, body: l10n.courierTrackingBody));
  } else {
    unawaited(tracker.stop());
  }
});

// ── Cola sin señal (H08.8) ──

final pendingStepsStoreProvider = Provider<PendingStepsStore>((ref) => platformPendingStepsStore());

class PendingState {
  const PendingState({this.steps = const [], this.sending = false, this.rejected});

  final List<PendingStep> steps;
  final bool sending;

  /// El último paso que la API no aceptó (ya salió de la cola): se le muestra al domiciliario.
  final ({PendingStep step, Failure error})? rejected;

  Iterable<PendingStep> of(String orderCode) => steps.where((s) => s.orderCode == orderCode);

  PendingState copyWith({List<PendingStep>? steps, bool? sending, ({PendingStep step, Failure error})? rejected, bool clearRejected = false}) =>
      PendingState(steps: steps ?? this.steps, sending: sending ?? this.sending, rejected: clearRejected ? null : rejected ?? this.rejected);
}

/// Los pasos del pedido pasan siempre por aquí: se guardan primero y luego se envían. Con señal salen al
/// instante; sin ella esperan y se reintentan cada 20 s, en el orden en que se hicieron.
class PendingStepsController extends Notifier<PendingState> {
  static const _retryEvery = Duration(seconds: 20);

  /// Enviado más tarde que esto desde que ocurrió: la API recibe la hora del teléfono.
  static const _lateAfter = Duration(seconds: 15);

  PendingStepsStore get _store => ref.read(pendingStepsStoreProvider);
  CourierRepository get _repository => ref.read(courierRepositoryProvider);

  @override
  PendingState build() {
    final timer = Timer.periodic(_retryEvery, (_) => flush());
    ref.onDispose(timer.cancel);
    unawaited(_store.load().then((steps) {
      if (steps.isEmpty) return;
      state = state.copyWith(steps: [...steps, ...state.steps.where((s) => !steps.contains(s))]);
      unawaited(flush());
    }));
    return const PendingState();
  }

  /// Registra el paso y trata de enviarlo. Devuelve true si ya llegó a la API, false si quedó en cola.
  /// Un rechazo de la API (el paso ya no aplica, la factura no sirve) se lanza como [Failure].
  Future<bool> submit({required String orderCode, required StepKind kind, String? amount, ReceiptPhoto? receipt}) async {
    if (PendingRules.duplicate(state.steps, orderCode, kind)) return false;
    final id = uuidV4();
    final step = PendingStep(
      id: id,
      orderCode: orderCode,
      kind: kind,
      occurredAt: DateTime.now(),
      amount: amount,
      receiptPath: receipt == null ? null : await _store.keepReceipt(id, receipt),
      receiptMime: receipt?.mimeType,
    );
    await _persist([...state.steps, step]);
    state = state.copyWith(clearRejected: true);
    await flush();
    final rejected = state.rejected;
    if (rejected != null && rejected.step.id == id) {
      // Quien lo marcó está mirando: lo ve en su pantalla, no hace falta el aviso general.
      dismissRejection();
      throw rejected.error;
    }
    return !state.steps.any((s) => s.id == id);
  }

  void dismissRejection() => state = state.copyWith(clearRejected: true);

  Future<void> flush() async {
    if (state.sending || state.steps.isEmpty) return;
    state = state.copyWith(sending: true);
    var changed = false;
    try {
      while (state.steps.isNotEmpty) {
        final step = state.steps.first;
        try {
          await _send(step);
          await _finish(step);
          changed = true;
        } catch (error) {
          if (PendingRules.retryable(error)) break;
          await _finish(step);
          state = state.copyWith(rejected: (step: step, error: error is Failure ? error : const Failure('', code: 'UNKNOWN')));
          changed = true;
        }
      }
    } finally {
      state = state.copyWith(sending: false);
      if (changed) {
        ref.invalidate(courierTripProvider);
        ref.invalidate(courierStatusProvider);
      }
    }
  }

  Future<void> _send(PendingStep step) async {
    final event = TripStepEvent(
      clientEventId: step.id,
      occurredAt: step.occurredAt,
      queued: DateTime.now().difference(step.occurredAt) > _lateAfter,
    );
    switch (step.kind) {
      case StepKind.purchase:
        var current = step;
        if (current.receiptFileId == null) {
          final photo = await _store.readReceipt(current);
          if (photo == null) throw const Failure('', code: 'RECEIPT_INVALID');
          current = current.withReceipt(await _repository.uploadReceipt(photo));
          // Ya subida: si lo que sigue falla, el reintento no la vuelve a subir.
          await _persist([for (final s in state.steps) s.id == current.id ? current : s]);
        }
        await _repository.purchase(current.orderCode, event, amount: current.amount!, receiptFileId: current.receiptFileId!);
      case StepKind.ready:
        await _repository.ready(step.orderCode, event);
      case StepKind.delay:
        await _repository.delay(step.orderCode, event);
    }
  }

  Future<void> _finish(PendingStep step) async {
    await _store.dropReceipt(step);
    await _persist([for (final s in state.steps) if (s.id != step.id) s]);
  }

  Future<void> _persist(List<PendingStep> steps) async {
    state = state.copyWith(steps: steps);
    await _store.save(steps);
  }
}

final pendingStepsProvider = NotifierProvider<PendingStepsController, PendingState>(PendingStepsController.new);
