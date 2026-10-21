import 'package:dio/dio.dart';

import '../../establishments/domain/entities/establishment.dart' show GeoPoint;
import '../domain/business.dart';

/// Endpoints públicos del negocio (E03): estado de atención, tasas para el precio aproximado y cobertura.
class BusinessRemoteDataSource {
  const BusinessRemoteDataSource(this._dio);

  final Dio _dio;

  Future<BusinessStatus> status() async {
    final response = await _dio.get<Map<String, dynamic>>('/business/status');
    return BusinessStatus.fromJson(response.data ?? const {});
  }

  Future<List<ExchangeRate>> exchangeRates() async {
    final response = await _dio.get<List<dynamic>>('/business/exchange-rates');
    return (response.data ?? const []).cast<Map<String, dynamic>>().map(ExchangeRate.fromJson).toList();
  }

  Future<List<CoverageArea>> coverage() async {
    final response = await _dio.get<Map<String, dynamic>>('/delivery/coverage');
    return ((response.data ?? const {})['municipalities'] as List? ?? const []).cast<Map<String, dynamic>>().map(CoverageArea.fromJson).toList();
  }

  Future<CoverageCheck> checkCoverage(GeoPoint point) async {
    final response = await _dio.get<Map<String, dynamic>>('/delivery/coverage/check', queryParameters: {'lat': point.lat, 'lng': point.lng});
    return CoverageCheck.fromJson(response.data ?? const {});
  }
}
