import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../../core/network/api_client.dart';
import '../../data/datasources/establishment_remote_datasource.dart';
import '../../data/repositories/establishment_repository_impl.dart';
import '../../domain/entities/cart.dart';
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

/// Categorías del catálogo, en el orden que definió el administrador.
final categoriesProvider = FutureProvider<List<Category>>((ref) => ref.watch(establishmentRepositoryProvider).categories());

/// Códigos elegidos en el menú lateral; vacío = todas.
class SelectedCategories extends Notifier<Set<String>> {
  @override
  Set<String> build() => const {};

  void toggle(String code) => state = state.contains(code) ? ({...state}..remove(code)) : {...state, code};

  void clear() => state = const {};
}

final selectedCategoriesProvider = NotifierProvider<SelectedCategories, Set<String>>(SelectedCategories.new);

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
  return ref.watch(getNearbyEstablishmentsProvider)(origin, categories);
});

/// Menú de un local en un idioma: (id, idioma).
final establishmentDetailProvider = FutureProvider.autoDispose.family<EstablishmentDetail, (String, String)>(
  (ref, key) => ref.watch(establishmentRepositoryProvider).findById(key.$1, language: key.$2),
);

/// Canasta en memoria: se envía a la API recién al confirmar el pedido (E04).
class CartNotifier extends Notifier<Cart?> {
  @override
  Cart? build() => null;

  void add(EstablishmentDetail establishment, MenuProduct product) =>
      state = CartRules.add(state, establishmentId: establishment.id, establishmentName: establishment.name, product: product);

  void setQuantity(String productId, int quantity) {
    final cart = state;
    if (cart != null) state = CartRules.setQuantity(cart, productId, quantity);
  }

  /// Devuelve qué cambió para que la vista avise; null si nada.
  ({List<String> removed, List<String> repriced})? reconcile(EstablishmentDetail menu) {
    final cart = state;
    if (cart == null) return null;
    final result = CartRules.reconcile(cart, menu);
    if (result.removed.isEmpty && result.repriced.isEmpty) return null;
    state = result.cart;
    return (removed: result.removed, repriced: result.repriced);
  }

  void clear() => state = null;
}

final cartProvider = NotifierProvider<CartNotifier, Cart?>(CartNotifier.new);
