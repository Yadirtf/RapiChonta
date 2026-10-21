import 'dart:async';
import 'dart:convert';

import 'package:huawei_push/huawei_push.dart';

import '../domain/push.dart';

/// Huawei Push Kit (HMS Core): teléfonos Huawei sin Google. El token llega por un stream, no como respuesta.
/// Los avisos los muestra HMS Core también con la app abierta; al tocarlos, los datos llegan como extras.
class HmsPushChannel implements PushChannel {
  @override
  PushProvider get provider => PushProvider.hms;

  @override
  Future<String?> token() async {
    final first = Push.getTokenStream.first.timeout(const Duration(seconds: 10));
    Push.getToken('');
    final token = await first;
    return token.isEmpty ? null : token;
  }

  @override
  Stream<String> get tokenRefreshes => Push.getTokenStream.handleError((Object _) {}).where((t) => t.isNotEmpty);

  @override
  Future<PushTap?> initialTap() async => _tapOf(await Push.getInitialNotification());

  @override
  Stream<PushTap> get taps => Push.onNotificationOpenedApp.map(_tapOf).where((t) => t != null).cast<PushTap>();

  /// HMS Core muestra los avisos aun con la app abierta (foreground_show): no hace falta el aviso propio.
  @override
  Stream<PushNotice> get foreground => const Stream.empty();

  /// Huawei sin Google llega hasta Android 12 (EMUI/HarmonyOS): el permiso viene concedido al instalar.
  @override
  Future<PushPermission> permission() async => PushPermission.granted;

  @override
  Future<bool> requestPermission() async => true;

  /// `extras` trae los S.rc_* del intent; si el aviso vino con `data`, también se lee.
  static PushTap? _tapOf(dynamic event) {
    if (event is! Map) return null;
    final extras = event['extras'];
    final fromExtras = PushTap.fromData(extras is Map ? extras : null);
    if (fromExtras != null) return fromExtras;
    final message = event['remoteMessage'];
    final data = message is Map ? message['data'] : null;
    if (data is String && data.isNotEmpty) {
      try {
        return PushTap.fromData(jsonDecode(data) as Map);
      } catch (_) {}
    }
    return null;
  }
}
