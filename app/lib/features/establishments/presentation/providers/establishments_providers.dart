import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';

import '../../../../core/network/api_client.dart';
import '../../../business/domain/business.dart';
import '../../../business/presentation/business_providers.dart';
import '../../data/datasources/establishment_remote_datasource.dart';
import '../../data/repositories/establishment_repository_impl.dart';
import '../../domain/entities/cart.dart';
import '../../domain/entities/establishment.dart';
import '../../domain/repositories/establishment_repository.dart';
import '../../domain/usecases/get_nearby_establishments.dart';

/// Centro de Villagarzón (Putumayo), ciudad de lanzamiento del MVP. Se usa si aún no hay cobertura publicada.
const defaultCenter = GeoPoint(1.0294, -76.6165);

/// Más lejos que esto de todo municipio abierto no hay locales que mostrar: el mapa se abre en el más cercano.
const serviceRadiusMeters = 15000.0;

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

/// Lo que reporta el GPS, aunque esté lejos; null sin permiso o con la ubicación apagada.
final deviceLocationProvider = FutureProvider<GeoPoint?>((ref) async {
  if (!await Geolocator.isLocationServiceEnabled()) return null;
  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
  if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return null;
  final position = await Geolocator.getCurrentPosition();
  return GeoPoint(position.latitude, position.longitude);
});

double _meters(GeoPoint a, GeoPoint b) => Geolocator.distanceBetween(a.lat, a.lng, b.lat, b.lng);

/// Dónde arranca el mapa. Con varios municipios abiertos (H03.5) se compara con todos: si el cliente está
/// cerca de alguno, en su ubicación; si no (o sin permiso), en el centro del municipio abierto más cercano.
final userLocationProvider = FutureProvider<GeoPoint>((ref) async {
  final device = await ref.watch(deviceLocationProvider.future);
  final areas = await ref.watch(coverageProvider.future);
  final from = device ?? defaultCenter;
  var home = areas.isEmpty ? defaultCenter : areas.first.center;
  for (final area in areas) {
    if (_meters(from, area.center) < _meters(from, home)) home = area.center;
  }
  return device != null && _meters(device, home) <= serviceRadiusMeters ? device : home;
});

/// Si llegamos a la ubicación del cliente y con qué tarifa, o a cuánto está de la cobertura. Null sin GPS.
final deviceCoverageProvider = FutureProvider<CoverageCheck?>((ref) async {
  final device = await ref.watch(deviceLocationProvider.future);
  if (device == null) return null;
  try {
    return await ref.watch(businessDataSourceProvider).checkCoverage(device);
  } catch (_) {
    return null;
  }
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

/// Dónde se guarda la canasta en el teléfono (sobrevive a cerrar la app). Se reemplaza en las pruebas.
abstract class CartStore {
  Future<Cart?> read();
  Future<void> write(Cart? cart);
}

class SecureCartStore implements CartStore {
  static const _key = 'rc.cart';
  static const _storage = FlutterSecureStorage();

  @override
  Future<Cart?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    try {
      return Cart.fromJson(jsonDecode(raw));
    } on FormatException {
      return null;
    }
  }

  @override
  Future<void> write(Cart? cart) => cart == null ? _storage.delete(key: _key) : _storage.write(key: _key, value: jsonEncode(cart.toJson()));
}

final cartStoreProvider = Provider<CartStore>((ref) => SecureCartStore());

/// Canasta guardada en el teléfono: solo productos, cantidades y notas (nada personal).
/// Se envía a la API recién al confirmar el pedido (E04).
class CartNotifier extends Notifier<Cart?> {
  /// true en cuanto el cliente toca la canasta: lo que se lea tarde del almacenamiento ya no la pisa.
  bool _touched = false;

  /// Local cuyo pedido ya se confirmó: si la canasta guardada es de ahí, no se restaura.
  String? _placedAt;

  @override
  Cart? build() {
    final store = ref.watch(cartStoreProvider);
    store.read().then((saved) {
      if (_touched || saved == null) return;
      state = saved.establishmentId == _placedAt ? null : saved;
    }, onError: (_) {});
    return null;
  }

  /// El pedido de ese local ya existe: su canasta se vacía (aunque todavía no se haya leído del teléfono).
  void placedAt(String establishmentId) {
    _placedAt = establishmentId;
    if (state?.establishmentId == establishmentId) state = null;
  }

  @override
  set state(Cart? value) {
    _touched = true;
    super.state = value;
    ref.read(cartStoreProvider).write(value).catchError((_) {});
  }

  void add(EstablishmentDetail establishment, MenuProduct product) =>
      state = CartRules.add(state, establishmentId: establishment.id, establishmentName: establishment.name, product: product);

  void setQuantity(String productId, int quantity) {
    final cart = state;
    if (cart != null) state = CartRules.setQuantity(cart, productId, quantity);
  }

  void setNotes(String productId, String notes) {
    final cart = state;
    if (cart != null) state = CartRules.setNotes(cart, productId, notes);
  }

  /// Corrige la canasta con lo que dijo la API al cotizar o confirmar.
  ({List<String> removed, List<String> repriced})? correct({Iterable<String> unavailable = const [], Map<String, ({String versionId, int priceCents})> changed = const {}}) {
    final cart = state;
    if (cart == null) return null;
    final result = CartRules.applyCorrections(cart, unavailable: unavailable, changed: changed);
    state = result.cart;
    return (removed: result.removed, repriced: result.repriced);
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
