import '../entities/order.dart';

/// Puerto del cliente para pedir y seguir sus pedidos (E04).
abstract class OrderRepository {
  Future<List<String>> paymentMethods();
  Future<OrderQuote> quote({required String establishmentId, required List<Map<String, dynamic>> items, required DeliveryTarget delivery, required String language});
  Future<OrderDetail> place({
    required String establishmentId,
    required List<Map<String, dynamic>> items,
    required DeliveryTarget delivery,
    required String paymentMethod,
    required RecipientChoice? recipient,
    required String? notes,
    required String clientRequestId,
    required String language,
  });
  Future<OrderHistory> mine({String? before});
  Future<OrderDetail> find(String code, {required String language});
  Future<List<SavedAddress>> addresses();
  Future<List<SavedRecipient>> recipients();
}
