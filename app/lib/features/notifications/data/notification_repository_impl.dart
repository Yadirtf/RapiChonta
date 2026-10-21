import 'package:dio/dio.dart';

import '../../../core/network/api_failure.dart';
import '../domain/push.dart';

/// Token push y bandeja de avisos en la API (/me/push-token, /me/notifications).
class NotificationRepositoryImpl implements NotificationRepository {
  const NotificationRepositoryImpl(this._dio);

  final Dio _dio;

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } catch (error) {
      throw toFailure(error);
    }
  }

  @override
  Future<void> registerToken(PushProvider provider, String token) =>
      _guard(() => _dio.put<void>('/me/push-token', data: {'provider': provider.apiValue, 'token': token}));

  @override
  Future<void> removeToken() => _guard(() => _dio.delete<void>('/me/push-token'));

  @override
  Future<NotificationPage> page({String? before}) => _guard(() async {
        final json = (await _dio.get<Map<String, dynamic>>('/me/notifications', queryParameters: {'before': ?before})).data!;
        return NotificationPage(
          items: (json['items'] as List).map((e) => AppNotification.fromJson(e as Map<String, dynamic>)).toList(),
          unread: json['unread'] as int,
          nextBefore: json['nextBefore'] as String?,
        );
      });

  @override
  Future<int> unread() => _guard(() async => (await _dio.get<Map<String, dynamic>>('/me/notifications/unread')).data!['unread'] as int);

  @override
  Future<int> markRead([List<String>? ids]) =>
      _guard(() async => (await _dio.post<Map<String, dynamic>>('/me/notifications/read', data: {'ids': ?ids})).data!['unread'] as int);
}
