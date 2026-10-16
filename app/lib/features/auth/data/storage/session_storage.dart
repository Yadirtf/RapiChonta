import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Lo que la app guarda entre aperturas. El token de refresco va al Keystore (Android, también Huawei sin
/// GMS) o al Keychain (iOS); nunca en SharedPreferences. El token de acceso solo vive en memoria.
abstract interface class SessionStorage {
  Future<String?> readRefreshToken();
  Future<void> writeRefreshToken(String token);
  Future<void> clearSession();

  /// Instalación de la app (tabla devices): se crea una vez y sobrevive a cerrar sesión.
  Future<String> installationId();

  /// Idioma elegido en la app ('es', 'en') o null para seguir el del teléfono.
  Future<String?> readLanguage();
  Future<void> writeLanguage(String language);
}

class SecureSessionStorage implements SessionStorage {
  SecureSessionStorage([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _refreshKey = 'rc.refreshToken';
  static const _installationKey = 'rc.installationId';
  static const _languageKey = 'rc.language';

  @override
  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  @override
  Future<void> writeRefreshToken(String token) => _storage.write(key: _refreshKey, value: token);

  @override
  Future<void> clearSession() => _storage.delete(key: _refreshKey);

  @override
  Future<String> installationId() async {
    final existing = await _storage.read(key: _installationKey);
    if (existing != null) return existing;
    final id = uuidV4();
    await _storage.write(key: _installationKey, value: id);
    return id;
  }

  @override
  Future<String?> readLanguage() => _storage.read(key: _languageKey);

  @override
  Future<void> writeLanguage(String language) => _storage.write(key: _languageKey, value: language);
}

/// UUID v4 con un generador criptográfico.
String uuidV4() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
