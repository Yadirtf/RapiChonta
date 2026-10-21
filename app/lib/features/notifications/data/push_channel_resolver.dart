import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/config/env.dart';
import '../domain/push.dart';
import 'fcm_push_channel.dart';
import 'hms_push_channel.dart';

/// Lo que la app recuerda del push entre aperturas (fuera de la sesión: es del teléfono).
class PushPreferences {
  PushPreferences([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _providerKey = 'rc.pushProvider';
  static const _askedKey = 'rc.pushAsked';

  Future<PushProvider?> provider() async => PushProvider.parse(await _storage.read(key: _providerKey));
  Future<void> rememberProvider(PushProvider provider) => _storage.write(key: _providerKey, value: provider.apiValue);

  /// Ya le explicamos para qué son los avisos: no se vuelve a preguntar.
  Future<bool> asked() async => await _storage.read(key: _askedKey) == '1';
  Future<void> markAsked() => _storage.write(key: _askedKey, value: '1');
}

/// Un canal listo y su token.
typedef ResolvedPush = ({PushChannel channel, String token});

/// Elige el servicio push del teléfono: FCM si hay Google; si no entrega token, Huawei Push Kit. El que
/// funcionó se recuerda para probarlo primero la próxima vez (un Huawei no espera a que FCM falle).
class PushChannelResolver {
  PushChannelResolver(this._preferences, {List<PushChannel>? candidates}) : _candidates = candidates ?? _platformCandidates();

  final PushPreferences _preferences;
  final List<PushChannel> _candidates;

  static List<PushChannel> _platformCandidates() {
    if (kIsWeb) return const [];
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => [if (Env.firebaseConfigured) FcmPushChannel(), if (Env.hmsEnabled) HmsPushChannel()],
      TargetPlatform.iOS => [if (Env.firebaseConfigured) FcmPushChannel()],
      _ => const [],
    };
  }

  Future<ResolvedPush?> resolve() async {
    if (_candidates.isEmpty) return null;
    final remembered = await _preferences.provider();
    final ordered = [..._candidates]..sort((a, b) => (a.provider == remembered ? 0 : 1) - (b.provider == remembered ? 0 : 1));
    for (final channel in ordered) {
      try {
        final token = await channel.token();
        if (token == null || token.isEmpty) continue;
        if (channel.provider != remembered) await _preferences.rememberProvider(channel.provider);
        return (channel: channel, token: token);
      } catch (error) {
        debugPrint('Push ${channel.provider.apiValue} no disponible: $error');
      }
    }
    return null;
  }
}
