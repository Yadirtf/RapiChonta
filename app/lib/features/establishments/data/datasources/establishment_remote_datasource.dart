import 'package:dio/dio.dart';

class EstablishmentRemoteDataSource {
  const EstablishmentRemoteDataSource(this._dio);

  final Dio _dio;

  Future<List<Map<String, dynamic>>> fetchNearby({
    required double lat,
    required double lng,
    required int radius,
    required List<String> categories,
  }) async {
    final response = await _dio.get<List<dynamic>>(
      '/establishments/nearby',
      queryParameters: {'lat': lat, 'lng': lng, 'radius': radius, 'categories': categories.join(',')},
    );
    return (response.data ?? []).cast<Map<String, dynamic>>();
  }
}
