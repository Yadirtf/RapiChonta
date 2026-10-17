import 'package:dio/dio.dart';

import '../domain/business.dart';

/// Endpoints públicos del negocio (E03): estado de atención y tasas para el precio aproximado.
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
}
