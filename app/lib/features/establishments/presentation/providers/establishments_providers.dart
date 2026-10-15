import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../../core/network/api_client.dart';
import '../../data/datasources/establishment_remote_datasource.dart';
import '../../data/repositories/establishment_repository_impl.dart';
import '../../domain/entities/establishment.dart';
import '../../domain/repositories/establishment_repository.dart';
import '../../domain/usecases/get_nearby_establishments.dart';

/// Centro de Villagarzón (Putumayo), ciudad de lanzamiento del MVP. Se usa sin permiso de ubicación.
const defaultCenter = GeoPoint(1.0294, -76.6165);

// Inyección de dependencias: aquí se conectan los adaptadores con los casos de uso.
final establishmentRepositoryProvider = Provider<EstablishmentRepository>(
  (ref) => EstablishmentRepositoryImpl(EstablishmentRemoteDataSource(buildApiClient())),
);

final getNearbyEstablishmentsProvider = Provider(
  (ref) => GetNearbyEstablishments(ref.watch(establishmentRepositoryProvider)),
);

class SelectedCategories extends Notifier<Set<EstablishmentCategory>> {
  @override
  Set<EstablishmentCategory> build() => {EstablishmentCategory.fastFood, EstablishmentCategory.restaurant};

  void toggle(EstablishmentCategory category) {
    state = state.contains(category) ? ({...state}..remove(category)) : {...state, category};
  }
}

final selectedCategoriesProvider =
    NotifierProvider<SelectedCategories, Set<EstablishmentCategory>>(SelectedCategories.new);

final userLocationProvider = FutureProvider<GeoPoint>((ref) async {
  if (!await Geolocator.isLocationServiceEnabled()) return defaultCenter;
  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
  if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
    return defaultCenter;
  }
  final position = await Geolocator.getCurrentPosition();
  return GeoPoint(position.latitude, position.longitude);
});

final nearbyEstablishmentsProvider = FutureProvider<List<Establishment>>((ref) async {
  final origin = await ref.watch(userLocationProvider.future);
  final categories = ref.watch(selectedCategoriesProvider);
  return ref.watch(getNearbyEstablishmentsProvider)(origin, categories.toList());
});
