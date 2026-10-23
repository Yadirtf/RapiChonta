import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_client.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/order_repository_impl.dart';
import '../../domain/entities/order.dart';
import '../../domain/repositories/order_repository.dart';

final orderRepositoryProvider = Provider<OrderRepository>(
  (ref) => OrderRepositoryImpl(public: buildApiClient(), authed: ref.watch(authedDioProvider)),
);

final paymentMethodsProvider = FutureProvider<List<String>>((ref) => ref.watch(orderRepositoryProvider).paymentMethods());

typedef CustomerBook = ({List<SavedAddress> addresses, SavedAddress? last, List<SavedRecipient> recipients});

/// Libreta del cliente: lugares guardados, a dónde fue su último pedido y personas a las que ya les envió.
/// Se vuelve a pedir al abrir el pedido.
final customerBookProvider = FutureProvider.autoDispose<CustomerBook>((ref) async {
  final repository = ref.watch(orderRepositoryProvider);
  final (addresses, last, recipients) = await (repository.addresses(), repository.lastAddress(), repository.recipients()).wait;
  return (addresses: addresses, last: last, recipients: recipients);
});

/// Mientras haya pedidos en curso, la lista se refresca sola.
const _activeRefresh = Duration(seconds: 30);

/// Primera página de Mis pedidos (los activos completos y el historial reciente).
final myOrdersProvider = FutureProvider.autoDispose<OrderHistory>((ref) async {
  final page = await ref.watch(orderRepositoryProvider).mine();
  if (page.active.isNotEmpty) {
    final timer = Timer(_activeRefresh, ref.invalidateSelf);
    ref.onDispose(timer.cancel);
  }
  return page;
});

/// Mientras el pedido está activo, su estado se vuelve a pedir cada 15 s; con el domiciliario en el local, cada
/// 4 s: una pregunta suya (E09) tiene minutos para responderse y no todos los teléfonos reciben push.
const _detailRefresh = Duration(seconds: 15);
const _atStoreRefresh = Duration(seconds: 4);

/// Detalle de un pedido: (código, idioma).
final orderDetailProvider = FutureProvider.autoDispose.family<OrderDetail, (String, String)>((ref, key) async {
  final order = await ref.watch(orderRepositoryProvider).find(key.$1, language: key.$2);
  if (order.active) {
    final atStore = order.status == 'AT_ESTABLISHMENT' || order.status == 'AWAITING_CUSTOMER';
    final timer = Timer(atStore ? _atStoreRefresh : _detailRefresh, ref.invalidateSelf);
    ref.onDispose(timer.cancel);
  }
  return order;
});
