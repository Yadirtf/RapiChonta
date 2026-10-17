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
      queryParameters: {'lat': lat, 'lng': lng, 'radius': radius, if (categories.isNotEmpty) 'categories': categories.join(',')},
    );
    return (response.data ?? []).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> fetchCategories() async {
    final response = await _dio.get<List<dynamic>>('/catalog/categories');
    return (response.data ?? []).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> fetchDetail(String id, {required String language}) async {
    final response = await _dio.get<Map<String, dynamic>>('/establishments/${Uri.encodeComponent(id)}', queryParameters: {'lang': language});
    return response.data ?? const {};
  }
}
