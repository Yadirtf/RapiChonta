import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/router.dart';
import '../../auth/domain/entities/account.dart';
import '../../auth/presentation/providers/auth_providers.dart';
import '../../courier/presentation/courier_providers.dart';
import '../../orders/presentation/providers/orders_providers.dart';
import '../data/notification_repository_impl.dart';
import '../data/push_channel_resolver.dart';
import '../domain/push.dart';
import 'widgets/push_banner.dart';
import 'widgets/push_permission_sheet.dart';

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) => NotificationRepositoryImpl(ref.watch(authedDioProvider)));
final pushPreferencesProvider = Provider<PushPreferences>((ref) => PushPreferences());
final pushResolverProvider = Provider<PushChannelResolver>((ref) => PushChannelResolver(ref.watch(pushPreferencesProvider)));

/// Avisos sin leer (la campana). Sin sesión, ninguno.
final unreadNotificationsProvider = FutureProvider.autoDispose<int>((ref) async {
  if (ref.watch(sessionProvider).value == null) return 0;
  return ref.watch(notificationRepositoryProvider).unread();
});

final pushControllerProvider = Provider<PushController>((ref) {
  final controller = PushController(ref);
  ref.onDispose(controller.stop);
  return controller;
});

/// H06.1: une el servicio push del teléfono con la sesión.
/// - Al entrar: elige FCM o Huawei, registra el token en la API y lo vuelve a registrar si el proveedor lo rota.
/// - Al tocar un aviso (con la app cerrada o en segundo plano): abre el pedido.
/// - Con la app abierta: muestra el aviso con la marca (PushBanner) y refresca lo que cambió.
/// - Al cerrar sesión: borra el token en la API antes de soltar la sesión.
class PushController {
  PushController(this._ref);

  final Ref _ref;
  final _subscriptions = <StreamSubscription<Object?>>[];
  ResolvedPush? _push;
  String? _userId;

  NotificationRepository get _repository => _ref.read(notificationRepositoryProvider);

  /// Este teléfono tiene push (FCM o Huawei) y ya se registró.
  bool get ready => _push != null;

  Future<void> start(String userId) async {
    if (_userId == userId) return;
    await stop();
    _userId = userId;
    final push = _push ?? await _ref.read(pushResolverProvider).resolve();
    if (push == null || _userId != userId) return;
    _push = push;
    final channel = push.channel;
    unawaited(_register(push.token));
    _subscriptions
      ..add(channel.tokenRefreshes.listen(_register, onError: (Object _) {}))
      ..add(channel.taps.listen(_open, onError: (Object _) {}))
      ..add(channel.foreground.listen(_showForeground, onError: (Object _) {}));
    final initial = await channel.initialTap().catchError((Object _) => null);
    if (initial != null) WidgetsBinding.instance.addPostFrameCallback((_) => _open(initial));
    // El domiciliario recibe las ofertas por push (E07): se le explica y pide el permiso al entrar.
    if (_ref.read(sessionProvider).value?.activeRole == Role.courier) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final context = rootNavigatorKey.currentContext;
        if (context != null && context.mounted) maybeAskPermission(context, courier: true);
      });
    }
  }

  Future<void> stop() async {
    _userId = null;
    for (final subscription in _subscriptions) {
      await subscription.cancel();
    }
    _subscriptions.clear();
  }

  /// Antes de cerrar sesión (con el token de acceso aún vigente). Sin red, la sesión cerrada ya corta los avisos.
  Future<void> release() async {
    if (_push != null) await _repository.removeToken().timeout(const Duration(seconds: 4)).catchError((Object _) {});
    await stop();
  }

  /// Explica para qué son los avisos y luego pide el permiso del sistema, una sola vez y solo si hace falta
  /// (Android 13+ e iOS; antes de eso viene concedido).
  Future<void> maybeAskPermission(BuildContext context, {bool courier = false}) async {
    final channel = _push?.channel;
    final preferences = _ref.read(pushPreferencesProvider);
    if (channel == null || await preferences.asked()) return;
    if (await channel.permission().catchError((Object _) => PushPermission.denied) != PushPermission.notDetermined) return;
    if (!context.mounted) return;
    final asking = PushPermissionSheet.show(context, courier: courier);
    await preferences.markAsked();
    final accepted = await asking;
    if (accepted == true) await channel.requestPermission().catchError((Object _) => false);
  }

  Future<void> _register(String token) async {
    final push = _push;
    if (push == null || _userId == null) return;
    try {
      await _repository.registerToken(push.channel.provider, token);
    } catch (error) {
      debugPrint('No se pudo registrar el token push: $error');
    }
  }

  void _open(PushTap tap) {
    final id = tap.notificationId;
    if (id != null) unawaited(_repository.markRead([id]).then((_) => _ref.invalidate(unreadNotificationsProvider), onError: (Object _) {}));
    _ref.read(routerProvider).push(tap.route);
  }

  void _showForeground(PushNotice notice) {
    _refresh(notice.tap);
    final overlay = rootNavigatorKey.currentState?.overlay;
    if (overlay != null) PushBanner.show(overlay, notice, onOpen: () => _open(notice.tap));
  }

  /// Lo que el aviso cambió: el contador, la lista de pedidos y el detalle abierto (o el turno del domiciliario).
  void _refresh(PushTap tap) {
    _ref.invalidate(unreadNotificationsProvider);
    if (tap.forCourier) {
      _ref.invalidate(courierOffersProvider);
      _ref.invalidate(courierTripProvider);
    } else if (tap.orderCode != null) {
      _ref.invalidate(myOrdersProvider);
      _ref.invalidate(orderDetailProvider);
    }
  }
}
