import 'package:dio/dio.dart';

import '../error/failure.dart';

/// Convierte un error de Dio en un [Failure] con el `code` estable que devuelve la API.
Failure toFailure(Object error) {
  if (error is Failure) return error;
  if (error is! DioException) return Failure(error.toString());
  final response = error.response;
  if (response == null) {
    return const Failure('Sin conexión', code: 'NETWORK_ERROR');
  }
  final body = response.data is Map ? Map<String, dynamic>.from(response.data as Map) : const <String, dynamic>{};
  final status = response.statusCode ?? 0;
  final code = body['code'] as String? ??
      switch (status) {
        400 => 'VALIDATION_FAILED',
        401 => 'SESSION_INVALID',
        403 => 'PERMISSION_DENIED',
        404 => 'NOT_FOUND',
        429 => 'TOO_MANY_REQUESTS',
        >= 500 => 'SERVER_ERROR',
        _ => 'REQUEST_FAILED',
      };
  final details = <String, dynamic>{
    if (body['details'] is Map) ...Map<String, dynamic>.from(body['details'] as Map),
    'retryAfterSeconds': ?int.tryParse(response.headers.value('retry-after') ?? ''),
  };
  return Failure(body['message']?.toString() ?? code, code: code, details: details);
}
