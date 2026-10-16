import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/auth/data/storage/session_storage.dart';
import 'package:rapichonta/features/auth/data/token_manager.dart';

class _MemoryStorage implements SessionStorage {
  String? refreshToken;

  @override
  Future<String?> readRefreshToken() async => refreshToken;
  @override
  Future<void> writeRefreshToken(String token) async => refreshToken = token;
  @override
  Future<void> clearSession() async => refreshToken = null;
  @override
  Future<String> installationId() async => 'installation';
  @override
  Future<String?> readLanguage() async => null;
  @override
  Future<void> writeLanguage(String language) async {}
}

/// Responde /auth/refresh con [status]; 200 entrega un par de tokens nuevo en cada llamada.
class _RefreshAdapter implements HttpClientAdapter {
  _RefreshAdapter(this.status);

  final int status;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? requestStream, Future<void>? cancelFuture) async {
    calls++;
    await Future<void>.delayed(const Duration(milliseconds: 10));
    if (status != 200) return ResponseBody.fromString('{"code":"SESSION_INVALID"}', status, headers: _json);
    final expires = DateTime.now().add(const Duration(minutes: 15)).toIso8601String();
    return ResponseBody.fromString(
      '{"accessToken":"access-$calls","accessTokenExpiresAt":"$expires","refreshToken":"refresh-$calls"}',
      200,
      headers: _json,
    );
  }

  static final _json = {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  };

  @override
  void close({bool force = false}) {}
}

void main() {
  late _MemoryStorage storage;

  TokenManager build(_RefreshAdapter adapter) {
    final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = adapter;
    return TokenManager(publicDio: dio, storage: storage);
  }

  setUp(() => storage = _MemoryStorage()..refreshToken = 'refresh-0');

  test('varias peticiones a la vez comparten una sola renovación', () async {
    final adapter = _RefreshAdapter(200);
    final tokens = build(adapter);

    final results = await Future.wait([tokens.accessToken(), tokens.accessToken(), tokens.accessToken()]);

    expect(adapter.calls, 1);
    expect(results, everyElement('access-1'));
    expect(storage.refreshToken, 'refresh-1');
  });

  test('un 401 rechazado por otra renovación reutiliza el token nuevo', () async {
    final adapter = _RefreshAdapter(200);
    final tokens = build(adapter);
    await tokens.accessToken();

    expect(await tokens.refresh(rejected: 'access-viejo'), 'access-1');
    expect(adapter.calls, 1);
  });

  test('un refresco revocado limpia la sesión y avisa a la interfaz', () async {
    final tokens = build(_RefreshAdapter(401));
    final ended = expectLater(tokens.sessionEnded, emits(null));

    expect(await tokens.accessToken(), isNull);
    expect(storage.refreshToken, isNull);
    await ended;
  });

  test('sin token de refresco no hay sesión ni petición', () async {
    storage.refreshToken = null;
    final adapter = _RefreshAdapter(200);

    expect(await build(adapter).accessToken(), isNull);
    expect(adapter.calls, 0);
  });
}
