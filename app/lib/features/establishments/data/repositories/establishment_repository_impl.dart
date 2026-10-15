import 'package:dio/dio.dart';

import '../../../../core/error/failure.dart';
import '../../domain/entities/establishment.dart';
import '../../domain/repositories/establishment_repository.dart';
import '../datasources/establishment_remote_datasource.dart';
import '../models/establishment_model.dart';

class EstablishmentRepositoryImpl implements EstablishmentRepository {
  const EstablishmentRepositoryImpl(this._remote);

  final EstablishmentRemoteDataSource _remote;

  @override
  Future<List<Establishment>> findNearby({
    required GeoPoint origin,
    required List<EstablishmentCategory> categories,
    int radiusMeters = 3000,
  }) async {
    try {
      final rows = await _remote.fetchNearby(
        lat: origin.lat,
        lng: origin.lng,
        radius: radiusMeters,
        categories: categories.map((c) => c.apiValue).toList(),
      );
      return rows.map(EstablishmentModel.fromJson).toList();
    } on DioException {
      throw const Failure('No pudimos cargar los establecimientos cercanos.');
    }
  }
}
