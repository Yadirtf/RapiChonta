import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'storage/session_storage.dart';

/// Tokens de la sesión en la app.
///
/// - Acceso (15 min): en memoria.
/// - Refresco (30 días, rotativo): en almacenamiento seguro. Cada renovación devuelve uno nuevo y el anterior
///   deja de servir; presentar uno ya usado cierra la sesión en la API. Por eso la renovación es de un solo
///   vuelo: si varias peticiones reciben 401 a la vez, todas esperan la misma renovación.
class TokenManager {
  TokenManager({required Dio publicDio, required SessionStorage storage})
      : _dio = publicDio,
        _storage = storage;

  final Dio _dio;
  final SessionStorage _storage;
  final _ended = StreamController<void>.broadcast();

  String? _accessToken;
  DateTime? _accessExpiresAt;
  Future<String?>? _inflight;

  static const _margin = Duration(seconds: 30);

  Stream<void> get sessionEnded => _ended.stream;

  /// Guarda la sesión que devolvió un ingreso, una renovación o un cambio de rol.
  Future<void> store(Map<String, dynamic> json) async {
    _accessToken = json['accessToken'] as String;
    _accessExpiresAt = DateTime.parse(json['accessTokenExpiresAt'] as String);
    final refresh = json['refreshToken'] as String?;
    if (refresh != null) await _storage.writeRefreshToken(refresh);
  }

  /// Olvida la sesión local. [notify] avisa a la interfaz (la sesión terminó sin que el usuario la cerrara).
  Future<void> clear({bool notify = false}) async {
    _accessToken = null;
    _accessExpiresAt = null;
    await _storage.clearSession();
    if (notify) _ended.add(null);
  }

  Future<String?> readRefreshToken() => _storage.readRefreshToken();

  /// Token vigente; si venció o está por vencer, lo renueva. null = no hay sesión.
  Future<String?> accessToken() async {
    final expires = _accessExpiresAt;
    if (_accessToken != null && expires != null && expires.difference(DateTime.now()) > _margin) return _accessToken;
    return refresh(rejected: _accessToken);
  }

  /// Renueva la sesión. Si [rejected] ya fue reemplazado por otra renovación, devuelve el nuevo sin pedir otro.
  Future<String?> refresh({String? rejected}) {
    if (_accessToken != null && _accessToken != rejected) return Future.value(_accessToken);
    return _inflight ??= _renew().whenComplete(() => _inflight = null);
  }

  Future<String?> _renew() async {
    final refreshToken = await _storage.readRefreshToken();
    if (refreshToken == null) return null;
    try {
      final response = await _dio.post<Map<String, dynamic>>('/auth/refresh', data: {'refreshToken': refreshToken});
      await store(response.data!);
      return _accessToken;
    } on DioException catch (error) {
      final status = error.response?.statusCode;
      // 401/403: el refresco venció, se revocó o se reutilizó. Sin red se conserva para intentarlo luego.
      if (status == 401 || status == 403) await clear(notify: true);
      debugPrint('Renovación de sesión fallida: ${status ?? error.type}');
      return null;
    }
  }
}

/// Agrega el token a cada petición y, ante un 401, renueva una sola vez y repite.
class AuthInterceptor extends QueuedInterceptor {
  AuthInterceptor(this._tokens, this._dio);

  final TokenManager _tokens;
  final Dio _dio;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _tokens.accessToken();
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    if (err.response?.statusCode != 401 || options.extra['retried'] == true) return handler.next(err);
    final used = (options.headers['Authorization'] as String?)?.replaceFirst('Bearer ', '');
    final token = await _tokens.refresh(rejected: used);
    if (token == null) return handler.next(err);
    try {
      options.headers['Authorization'] = 'Bearer $token';
      options.extra['retried'] = true;
      handler.resolve(await _dio.fetch<dynamic>(options));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }
}
