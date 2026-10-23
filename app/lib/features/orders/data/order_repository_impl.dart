import 'package:dio/dio.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_failure.dart';
import '../../establishments/domain/entities/establishment.dart';
import '../domain/entities/adjustment.dart';
import '../domain/entities/order.dart';
import '../domain/repositories/order_repository.dart';

/// Adaptador HTTP de los pedidos. Montos de la API en texto decimal ("14000.00") → centavos.
class OrderRepositoryImpl implements OrderRepository {
  const OrderRepositoryImpl({required Dio public, required Dio authed}) : _public = public, _authed = authed;

  final Dio _public;
  final Dio _authed;

  Future<T> _call<T>(Future<T> Function() request) async {
    try {
      return await request();
    } catch (error) {
      throw toFailure(error);
    }
  }

  @override
  Future<List<String>> paymentMethods() => _call(() async {
        final response = await _public.get<List<dynamic>>('/orders/payment-methods');
        return [for (final m in (response.data ?? const []).cast<Map<String, dynamic>>()) m['code'] as String];
      });

  @override
  Future<OrderQuote> quote({required String establishmentId, required List<Map<String, dynamic>> items, required DeliveryTarget delivery, required String language}) =>
      _call(() async {
        final response = await _authed.post<Map<String, dynamic>>('/orders/quote',
            data: {'establishmentId': establishmentId, 'items': items, 'delivery': delivery.toJson(), 'lang': language});
        return quoteFromJson(response.data ?? const {});
      });

  @override
  Future<OrderDetail> place({
    required String establishmentId,
    required List<Map<String, dynamic>> items,
    required DeliveryTarget delivery,
    required String paymentMethod,
    required RecipientChoice? recipient,
    required String? notes,
    required String clientRequestId,
    required String language,
  }) =>
      _call(() async {
        final response = await _authed.post<Map<String, dynamic>>('/orders', data: {
          'establishmentId': establishmentId,
          'items': items,
          'delivery': delivery.toJson(),
          'paymentMethod': paymentMethod,
          'recipient': recipient?.toJson(),
          'notes': notes,
          'clientRequestId': clientRequestId,
          'lang': language,
        });
        return detailFromJson(response.data ?? const {});
      });

  @override
  Future<OrderHistory> mine({String? before}) => _call(() async {
        final response = await _authed.get<Map<String, dynamic>>('/orders', queryParameters: {'before': ?before});
        final json = response.data ?? const {};
        List<OrderSummary> list(String key) => [for (final o in (json[key] as List? ?? const []).cast<Map<String, dynamic>>()) summaryFromJson(o)];
        return OrderHistory(
          active: list('active'),
          past: list('past'),
          nextBefore: json['nextBefore'] as String?,
          journey: (json['journey'] as List? ?? const []).cast<String>(),
        );
      });

  @override
  Future<OrderDetail> find(String code, {required String language}) => _call(() async {
        final response = await _authed.get<Map<String, dynamic>>('/orders/${Uri.encodeComponent(code)}', queryParameters: {'lang': language});
        return detailFromJson(response.data ?? const {});
      });

  @override
  Future<void> confirmReceived(String code) => _call(() => _authed.post<void>('/orders/${Uri.encodeComponent(code)}/received'));

  @override
  Future<void> reportNotReceived(String code) => _call(() => _authed.post<void>('/orders/${Uri.encodeComponent(code)}/not-received'));

  @override
  Future<List<SubstituteOption>> substitutes(String code, String adjustmentId, {required String language}) => _call(() async {
        final response = await _authed.get<Map<String, dynamic>>(
          '/orders/${Uri.encodeComponent(code)}/adjustments/${Uri.encodeComponent(adjustmentId)}/substitutes',
          queryParameters: {'lang': language},
        );
        return [
          for (final s in (response.data?['items'] as List? ?? const []).cast<Map<String, dynamic>>())
            SubstituteOption(
              productId: s['productId'] as String,
              productVersionId: s['productVersionId'] as String,
              name: s['name'] as String,
              priceCents: _cents(s['price']),
              imageUrl: Env.resolveAsset(s['imageUrl'] as String?),
              sameSection: s['sameSection'] as bool? ?? false,
            ),
        ];
      });

  @override
  Future<void> decideAdjustment(String code, String adjustmentId, {required String decision, String? productVersionId}) => _call(
        () => _authed.post<void>(
          '/orders/${Uri.encodeComponent(code)}/adjustments/${Uri.encodeComponent(adjustmentId)}/decision',
          data: {'decision': decision, 'productVersionId': ?productVersionId},
        ),
      );

  @override
  Future<List<SavedAddress>> addresses() => _call(() async {
        final response = await _authed.get<List<dynamic>>('/me/addresses');
        return [for (final a in (response.data ?? const []).cast<Map<String, dynamic>>()) addressFromJson(a)];
      });

  @override
  Future<List<SavedRecipient>> recipients() => _call(() async {
        final response = await _authed.get<List<dynamic>>('/me/recipients');
        return [
          for (final r in (response.data ?? const []).cast<Map<String, dynamic>>())
            SavedRecipient(id: r['id'] as String, fullName: r['fullName'] as String, phone: r['phone'] as String),
        ];
      });
}

int _cents(Object? decimal) => parsePriceCents(decimal?.toString() ?? '') ?? 0;

SavedAddress addressFromJson(Map<String, dynamic> a) => SavedAddress(
      id: a['id'] as String? ?? '',
      label: a['label'] as String?,
      line: a['line'] as String?,
      reference: a['reference'] as String?,
      location: GeoPoint((a['latitude'] as num).toDouble(), (a['longitude'] as num).toDouble()),
      isDefault: a['isDefault'] as bool? ?? false,
    );

OrderQuote quoteFromJson(Map<String, dynamic> json) {
  final limit = json['newCustomerLimit'] as Map<String, dynamic>?;
  return OrderQuote(
    itemsCents: _cents(json['itemsTotal']),
    feeCents: _cents(json['deliveryFee']),
    totalCents: _cents(json['total']),
    prepMinutes: (json['prepMinutes'] as num?)?.toInt() ?? 0,
    zoneName: (json['zone'] as Map?)?['name'] as String? ?? '',
    newCustomerLimit: limit == null
        ? null
        : NewCustomerLimit(limitCents: _cents(limit['limit']), availableCents: _cents(limit['available']), exceeded: limit['exceeded'] as bool? ?? false),
  );
}

OrderSummary summaryFromJson(Map<String, dynamic> json) {
  final store = json['establishment'] as Map<String, dynamic>? ?? const {};
  return OrderSummary(
    code: json['code'] as String,
    establishmentId: store['id'] as String? ?? '',
    establishmentName: store['name'] as String? ?? '',
    logoUrl: store['logoUrl'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
    status: json['status'] as String,
    statusAt: DateTime.parse(json['statusAt'] as String),
    active: json['active'] as bool? ?? false,
    itemCount: (json['itemCount'] as num?)?.toInt() ?? 0,
    totalCents: _cents(json['total']),
  );
}

OrderDetail detailFromJson(Map<String, dynamic> json) {
  final s = summaryFromJson(json);
  final recipient = json['recipient'] as Map<String, dynamic>?;
  final preparation = json['preparation'] as Map<String, dynamic>?;
  final purchase = json['purchase'] as Map<String, dynamic>?;
  final delivery = json['delivery'] as Map<String, dynamic>? ?? const {};
  return OrderDetail(
    code: s.code,
    establishmentId: s.establishmentId,
    establishmentName: s.establishmentName,
    logoUrl: s.logoUrl,
    createdAt: s.createdAt,
    status: s.status,
    statusAt: s.statusAt,
    active: s.active,
    itemCount: s.itemCount,
    totalCents: s.totalCents,
    lines: [
      for (final l in (json['lines'] as List? ?? const []).cast<Map<String, dynamic>>())
        OrderLine(
          productId: l['productId'] as String,
          name: l['name'] as String,
          unitCents: _cents(l['unitPrice']),
          quantity: (l['quantity'] as num).toInt(),
          notes: l['notes'] as String?,
        ),
    ],
    itemsCents: _cents(json['itemsTotal']),
    feeCents: _cents(json['deliveryFee']),
    prepMinutes: (json['prepMinutes'] as num?)?.toInt() ?? 0,
    zoneName: (json['zone'] as Map?)?['name'] as String? ?? '',
    address: addressFromJson(json['address'] as Map<String, dynamic>),
    recipient: recipient == null ? null : (fullName: recipient['fullName'] as String, phone: recipient['phone'] as String?),
    paymentMethod: json['paymentMethod'] as String,
    notes: json['notes'] as String?,
    timeline: [
      for (final t in (json['timeline'] as List? ?? const []).cast<Map<String, dynamic>>()) TimelineEntry(t['status'] as String, DateTime.parse(t['at'] as String)),
    ],
    journey: (json['journey'] as List? ?? const []).cast<String>(),
    preparation: preparation == null
        ? null
        : (estimatedReadyAt: DateTime.parse(preparation['estimatedReadyAt'] as String), delayed: preparation['delayed'] as bool? ?? false),
    purchase: purchase == null ? null : (amountCents: _cents(purchase['amount']), receiptUrl: Env.resolveAsset(purchase['receiptUrl'] as String?)),
    delivery: OrderDelivery(
      code: delivery['code'] as String?,
      proofUrl: Env.resolveAsset(delivery['proofUrl'] as String?),
      reviewClosesAt: delivery['reviewClosesAt'] is String ? DateTime.parse(delivery['reviewClosesAt'] as String) : null,
    ),
    adjustments: [for (final a in (json['adjustments'] as List? ?? const []).cast<Map<String, dynamic>>()) adjustmentFromJson(a)],
  );
}

/// Una consulta de E09 (la misma forma en el pedido del cliente y en el del domiciliario).
OrderAdjustment adjustmentFromJson(Map<String, dynamic> json) => OrderAdjustment(
      id: json['id'] as String,
      reportedAt: DateTime.parse(json['reportedAt'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      open: json['open'] as bool? ?? false,
      lines: [
        for (final l in (json['lines'] as List? ?? const []).cast<Map<String, dynamic>>())
          AdjustmentLine(
            id: l['id'] as String,
            orderItemId: l['orderItemId'] as String,
            name: l['name'] as String,
            quantity: (l['quantity'] as num).toInt(),
            unitCents: _cents(l['unitPrice']),
            reason: l['reason'] as String,
            reportedUnitCents: l['reportedUnitPrice'] == null ? null : _cents(l['reportedUnitPrice']),
            decision: l['decision'] as String?,
            decidedAt: l['decidedAt'] is String ? DateTime.parse(l['decidedAt'] as String) : null,
            substitute: switch (l['substitute']) {
              final Map<String, dynamic> s => (name: s['name'] as String, quantity: (s['quantity'] as num).toInt(), unitCents: _cents(s['unitPrice'])),
              _ => null,
            },
            options: (l['options'] as List? ?? const []).cast<String>(),
          ),
      ],
    );
