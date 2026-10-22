import '../entities/adjustment.dart';
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

  /// "Recibí mi pedido".
  Future<void> confirmReceived(String code);

  /// "No lo recibí" (después de una entrega con foto).
  Future<void> reportNotReceived(String code);

  /// "Cambiar por": productos del local para la línea que falta, los parecidos primero (E09).
  Future<List<SubstituteOption>> substitutes(String code, String adjustmentId, {required String language});

  /// La decisión del cliente sobre una línea (con CANCEL_ORDER, sobre todo el pedido).
  Future<void> decideAdjustment(String code, String adjustmentId, {required String decision, String? productVersionId});
  Future<List<SavedAddress>> addresses();
  Future<List<SavedRecipient>> recipients();
}
