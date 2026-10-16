import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../storage/session_storage.dart';

/// Llamadas HTTP de identidad. [_public] no lleva token (ingresos); [_authed] lo agrega y lo renueva.
class IdentityRemoteDataSource {
  const IdentityRemoteDataSource({required Dio public, required Dio authed, required SessionStorage storage})
      : _public = public,
        _authed = authed,
        _storage = storage;

  final Dio _public;
  final Dio _authed;
  final SessionStorage _storage;

  /// La API devuelve el token de refresco en el cuerpo (no en cookie) a las plataformas móviles.
  /// La web de clientes es la app Next.js; el destino web de Flutter no se usa para sesiones.
  Future<Map<String, dynamic>> _device() async => {
        'installationId': await _storage.installationId(),
        'platform': defaultTargetPlatform == TargetPlatform.iOS ? 'IOS' : 'ANDROID',
      };

  Future<Map<String, dynamic>> _post(Dio dio, String path, Map<String, dynamic> body) async =>
      (await dio.post<Map<String, dynamic>>(path, data: body)).data ?? const {};

  // ── Ingreso ──
  Future<Map<String, dynamic>> requestCode(String phone, String language) =>
      _post(_public, '/auth/otp', {'phone': phone, 'language': language, 'channel': 'SMS'});

  Future<Map<String, dynamic>> verifyCode(String challengeId, String code) async =>
      _post(_public, '/auth/otp/verify', {'challengeId': challengeId, 'code': code, 'device': await _device()});

  Future<Map<String, dynamic>> register(Map<String, dynamic> body) async =>
      _post(_public, '/auth/register', {...body, 'device': await _device()});

  Future<Map<String, dynamic>> startPasswordSignIn(String phone, String password, String language) =>
      _post(_public, '/auth/password', {'phone': phone, 'password': password, 'language': language, 'channel': 'SMS'});

  Future<Map<String, dynamic>> completePasswordSignIn(String challengeId, String code) async =>
      _post(_public, '/auth/password/verify', {'challengeId': challengeId, 'code': code, 'device': await _device()});

  Future<Map<String, dynamic>> switchRole(String role, String? password) =>
      _post(_authed, '/auth/switch-role', {'role': role, 'password': ?password});

  Future<void> signOut(String refreshToken) => _public.post<void>('/auth/sign-out', data: {'refreshToken': refreshToken});

  // ── Mi cuenta ──
  Future<Map<String, dynamic>> me() async => (await _authed.get<Map<String, dynamic>>('/me')).data!;

  Future<Map<String, dynamic>> updateProfile(String givenNames, String? familyNames) async =>
      (await _authed.patch<Map<String, dynamic>>('/me/profile', data: {'givenNames': givenNames, 'familyNames': familyNames}))
          .data!;

  Future<Map<String, dynamic>> setLanguage(String language) async =>
      (await _authed.put<Map<String, dynamic>>('/me/language', data: {'language': language})).data!;

  Future<Map<String, dynamic>> requestPhoneChange(String phone, String language) =>
      _post(_authed, '/me/phone/otp', {'phone': phone, 'language': language, 'channel': 'SMS'});

  Future<Map<String, dynamic>> confirmPhoneChange(String challengeId, String code) async =>
      _post(_authed, '/me/phone/verify', {'challengeId': challengeId, 'code': code, 'device': await _device()});

  Future<Map<String, dynamic>> acceptConsents(List<String> ids) =>
      _post(_authed, '/me/consents', {'legalDocumentVersionIds': ids});

  Future<void> changePassword(String current, String next) =>
      _authed.put<void>('/me/password', data: {'currentPassword': current, 'newPassword': next});

  Future<void> deleteMyData() => _authed.post<void>('/me/data-deletion', data: {'confirmation': 'DELETE_MY_DATA'});
}
