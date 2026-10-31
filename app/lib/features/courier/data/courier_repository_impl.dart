import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_failure.dart';
import '../../establishments/domain/entities/establishment.dart';
import '../../orders/data/order_repository_impl.dart' show adjustmentFromJson;
import '../../orders/domain/entities/adjustment.dart';
import '../domain/cash_box.dart';
import '../domain/courier.dart';

/// Adaptador HTTP del modo domiciliario: /courier (E07) y /courier/trip (E08).
class CourierRepositoryImpl implements CourierRepository {
  const CourierRepositoryImpl({required Dio authed, required Dio upload}) : _authed = authed, _upload = upload;

  final Dio _authed;

  /// Sin token: el PUT de la foto va a una URL firmada (la API o el almacenamiento).
  final Dio _upload;

  Future<T> _call<T>(Future<T> Function() request) async {
    try {
      return await request();
    } catch (error) {
      throw toFailure(error);
    }
  }

  @override
  Future<CourierStatus> status() => _call(() async => statusFromJson((await _authed.get<Map<String, dynamic>>('/courier/status')).data ?? const {}));

  @override
  Future<CourierStatus> setAvailable(bool available) => _call(
        () async => statusFromJson((await _authed.put<Map<String, dynamic>>('/courier/availability', data: {'available': available})).data ?? const {}),
      );

  @override
  Future<({int accepted, ({String orderCode, String status})? arrival})> reportLocations(List<LocationReading> readings) => _call(() async {
        final response = await _authed.post<Map<String, dynamic>>('/courier/locations', data: {
          'readings': [for (final r in readings) r.toJson()],
          // La API compara esta hora con la suya y corrige la de cada lectura si el reloj está mal puesto.
          'sentAt': DateTime.now().toUtc().toIso8601String(),
        });
        final json = response.data ?? const {};
        final arrival = json['arrival'] as Map<String, dynamic>?;
        return (
          accepted: (json['accepted'] as num?)?.toInt() ?? 0,
          arrival: arrival == null ? null : (orderCode: arrival['orderCode'] as String, status: arrival['status'] as String),
        );
      });

  @override
  Future<List<CourierOffer>> offers({required String language}) => _call(() async {
        final response = await _authed.get<List<dynamic>>('/courier/offers', queryParameters: {'lang': language});
        return [for (final o in (response.data ?? const []).cast<Map<String, dynamic>>()) offerFromJson(o)];
      });

  @override
  Future<String> accept(String offerId) => _call(() async {
        final response = await _authed.post<Map<String, dynamic>>('/courier/offers/${Uri.encodeComponent(offerId)}/accept');
        return response.data?['orderCode'] as String;
      });

  @override
  Future<void> reject(String offerId) => _call(() => _authed.post<void>('/courier/offers/${Uri.encodeComponent(offerId)}/reject'));

  @override
  Future<Trip?> trip({required String language}) => _call(() async {
        final response = await _authed.get<Map<String, dynamic>>('/courier/trip', queryParameters: {'lang': language});
        final trip = response.data?['trip'] as Map<String, dynamic>?;
        return trip == null ? null : tripFromJson(trip);
      });

  @override
  Future<TripRoute?> route(String code, GeoPoint from) => _call(() async {
        final response = await _authed.get<Map<String, dynamic>>(
          '/courier/trip/${Uri.encodeComponent(code)}/route',
          queryParameters: {'lat': from.lat, 'lng': from.lng},
        );
        return tripRouteFromJson(response.data?['route'] as Map<String, dynamic>?);
      });

  @override
  Future<String> uploadReceipt(ReceiptPhoto photo) => _uploadPhoto(photo, 'PURCHASE_RECEIPT');

  @override
  Future<String> uploadDeliveryProof(ReceiptPhoto photo) => _uploadPhoto(photo, 'DELIVERY_PROOF');

  /// Pedir permiso (con la huella SHA-256) → PUT de los bytes a la URL firmada → confirmar.
  Future<String> _uploadPhoto(ReceiptPhoto photo, String purpose) => _call(() async {
        final bytes = Uint8List.fromList(photo.bytes);
        final ticket = (await _authed.post<Map<String, dynamic>>('/files/uploads', data: {
          'purpose': purpose,
          'mimeType': photo.mimeType,
          'sizeBytes': bytes.length,
          'sha256': sha256.convert(bytes).toString(),
        }))
            .data!;
        final fileId = ticket['fileId'] as String;
        if (ticket['alreadyUploaded'] == true) return fileId;
        final upload = ticket['upload'] as Map<String, dynamic>;
        await _upload.request<void>(
          Env.resolveAsset(upload['url'] as String)!,
          data: bytes,
          options: Options(
            method: upload['method'] as String? ?? 'PUT',
            headers: {...?(upload['headers'] as Map?)?.cast<String, Object>(), Headers.contentLengthHeader: bytes.length},
            contentType: photo.mimeType,
          ),
        );
        await _authed.post<void>('/files/uploads/${Uri.encodeComponent(ticket['ticket'] as String)}/complete');
        return fileId;
      });

  @override
  Future<StepOutcome> purchase(String code, TripStepEvent event, {required String amount, required String receiptFileId}) =>
      _step(code, 'purchase', {...event.toJson(), 'amount': amount, 'receiptFileId': receiptFileId});

  @override
  Future<StepOutcome> ready(String code, TripStepEvent event) => _step(code, 'ready', event.toJson());

  @override
  Future<StepOutcome> pickUp(String code, TripStepEvent event) => _step(code, 'pickup', event.toJson());

  @override
  Future<StepOutcome> delay(String code, TripStepEvent event) => _step(code, 'delay', event.toJson());

  @override
  Future<StepOutcome> reportAdjustment(String code, TripStepEvent event, {required List<ReportedLine> lines}) =>
      _step(code, 'adjustments', {...event.toJson(), 'lines': [for (final l in lines) l.toJson()]});

  @override
  Future<StepOutcome> arrived(String code, TripStepEvent event) => _step(code, 'arrived', event.toJson());

  @override
  Future<StepOutcome> deliver(String code, TripStepEvent event, {required String deliveryCode}) =>
      _step(code, 'deliver', {...event.toJson(), 'deliveryCode': deliveryCode});

  @override
  Future<StepOutcome> proof(String code, TripStepEvent event, {required String fileId}) => _step(code, 'proof', {...event.toJson(), 'fileId': fileId});

  @override
  Future<StepOutcome> collect(String code, TripStepEvent event, {required List<CollectedPayment> payments}) => _call(() async {
        final response = await _authed.post<Map<String, dynamic>>('/courier/orders/${Uri.encodeComponent(code)}/collection', data: {
          ...event.toJson(),
          'payments': [for (final p in payments) p.toJson()],
        });
        return (status: null, replayed: response.data?['replayed'] as bool? ?? false);
      });

  @override
  Future<List<CollectionAccount>> collectionAccounts() => _call(() async {
        final response = await _authed.get<Map<String, dynamic>>('/courier/collection-accounts');
        return [for (final a in (response.data?['accounts'] as List? ?? const []).cast<Map<String, dynamic>>()) accountFromJson(a)];
      });

  @override
  Future<List<PendingCollection>> pendingCollections() => _call(() async {
        final response = await _authed.get<Map<String, dynamic>>('/courier/collections/pending');
        return [
          for (final o in (response.data?['orders'] as List? ?? const []).cast<Map<String, dynamic>>())
            PendingCollection(
              code: o['code'] as String,
              status: o['status'] as String,
              storeName: o['storeName'] as String,
              customerTotalCents: _cents(o['customerTotal']),
              paymentMethod: o['paymentMethod'] as String,
              closedAt: DateTime.parse(o['closedAt'] as String),
            ),
        ];
      });

  @override
  Future<CourierCashDay> cashBox({String? date}) => _call(() async {
        final response = await _authed.get<Map<String, dynamic>>('/courier/cash-box', queryParameters: {'date': ?date});
        return cashDayFromJson(response.data!);
      });

  @override
  Future<CollectionAccount> setAccountQr(String accountId, ReceiptPhoto photo) async {
    final fileId = await _uploadPhoto(photo, 'COLLECTION_QR');
    return _call(() async {
      final response = await _authed.put<Map<String, dynamic>>('/courier/collection-accounts/${Uri.encodeComponent(accountId)}/qr', data: {'fileId': fileId});
      return accountFromJson(response.data!);
    });
  }

  Future<StepOutcome> _step(String code, String action, Map<String, dynamic> body) => _call(() async {
        final response = await _authed.post<Map<String, dynamic>>('/courier/trip/${Uri.encodeComponent(code)}/$action', data: body);
        final json = response.data ?? const {};
        return (status: json['status'] as String?, replayed: json['replayed'] as bool? ?? false);
      });
}

int _cents(Object? decimal) => parsePriceCents(decimal?.toString() ?? '') ?? 0;
GeoPoint _point(Map<String, dynamic> json) => GeoPoint((json['latitude'] as num).toDouble(), (json['longitude'] as num).toDouble());
DateTime? _date(Object? value) => value is String ? DateTime.parse(value) : null;

List<TripLine> _lines(Object? json) => [
      for (final l in (json as List? ?? const []).cast<Map<String, dynamic>>())
        TripLine(
          id: l['id'] as String?,
          name: l['name'] as String,
          quantity: (l['quantity'] as num).toInt(),
          notes: l['notes'] as String?,
          unitCents: _cents(l['unitPrice']),
        ),
    ];

CollectionAccount accountFromJson(Map<String, dynamic> json) => CollectionAccount(
      id: json['id'] as String,
      paymentMethod: json['paymentMethod'] as String,
      bank: json['bank'] as String?,
      accountType: json['accountType'] as String?,
      accountNumber: json['accountNumber'] as String,
      holderName: json['holderName'] as String,
      qrUrl: Env.resolveAsset(json['qrUrl'] as String?),
    );

CourierStatus statusFromJson(Map<String, dynamic> json) {
  final active = json['activeOrder'] as Map<String, dynamic>?;
  return CourierStatus(
    verified: json['verified'] as bool? ?? false,
    locationConsentPending: json['locationConsentPending'] as bool? ?? false,
    availableSince: _date(json['availableSince']),
    activeOrder: active == null ? null : (code: active['code'] as String, status: active['status'] as String),
    lastLocationAt: _date(json['lastLocationAt']),
    locationFresh: json['locationFresh'] as bool? ?? false,
  );
}

CourierOffer offerFromJson(Map<String, dynamic> json) {
  final store = json['establishment'] as Map<String, dynamic>;
  return CourierOffer(
    offerId: json['offerId'] as String,
    orderCode: json['orderCode'] as String,
    expiresAt: DateTime.parse(json['expiresAt'] as String),
    storeName: store['name'] as String,
    storeAddress: store['addressLine'] as String? ?? '',
    storeLocation: _point(store),
    zoneName: (json['zone'] as Map?)?['name'] as String? ?? '',
    lines: _lines(json['lines']),
    itemsCents: _cents(json['itemsTotal']),
    feeCents: _cents(json['deliveryFee']),
    paymentMethod: json['paymentMethod'] as String,
    distanceMeters: (json['distanceMeters'] as num?)?.toInt(),
  );
}

Trip tripFromJson(Map<String, dynamic> json) {
  final store = json['establishment'] as Map<String, dynamic>;
  final destination = json['destination'] as Map<String, dynamic>?;
  final preparation = json['preparation'] as Map<String, dynamic>?;
  final purchase = json['purchase'] as Map<String, dynamic>?;
  final delivery = json['delivery'] as Map<String, dynamic>?;
  final merchant = json['merchant'] as Map<String, dynamic>?;
  return Trip(
    code: json['code'] as String,
    status: json['status'] as String,
    statusAt: DateTime.parse(json['statusAt'] as String),
    acceptedAt: DateTime.parse(json['acceptedAt'] as String),
    storeName: store['name'] as String,
    storeAddress: store['addressLine'] as String? ?? '',
    storePhone: store['phone'] as String?,
    storeLocation: _point(store),
    storeArea: [for (final p in (store['area'] as List? ?? const []).cast<Map<String, dynamic>>()) _point(p)],
    zoneName: (json['zone'] as Map?)?['name'] as String? ?? '',
    lines: _lines(json['lines']),
    itemsCents: _cents(json['itemsTotal']),
    feeCents: _cents(json['deliveryFee']),
    customerTotalCents: _cents(json['customerTotal']),
    paymentMethod: json['paymentMethod'] as String,
    notes: json['notes'] as String?,
    fulfillmentMode: json['fulfillmentMode'] as String? ?? 'COURIER_PURCHASE',
    merchant: merchant == null ? null : (estimatedReadyAt: DateTime.parse(merchant['estimatedReadyAt'] as String), readyAt: _date(merchant['readyAt'])),
    destination: destination == null
        ? null
        : TripDestination(
            location: _point(destination),
            label: destination['label'] as String?,
            line: destination['line'] as String?,
            reference: destination['reference'] as String?,
            recipientName: destination['recipientName'] as String,
            recipientPhone: destination['recipientPhone'] as String?,
          ),
    preparation: preparation == null
        ? null
        : TripPreparation(
            startedAt: DateTime.parse(preparation['startedAt'] as String),
            estimatedReadyAt: DateTime.parse(preparation['estimatedReadyAt'] as String),
            delayCount: (preparation['delayCount'] as num?)?.toInt() ?? 0,
            nextCheckAt: DateTime.parse(preparation['nextCheckAt'] as String),
          ),
    purchase: purchase == null ? null : (amountCents: _cents(purchase['amount']), receiptUrl: Env.resolveAsset(purchase['receiptUrl'] as String?)),
    delivery: delivery == null
        ? null
        : TripDelivery(
            arrivedAt: _date(delivery['arrivedAt']),
            proofAvailableAt: _date(delivery['proofAvailableAt']),
            codeAttemptsLeft: (delivery['codeAttemptsLeft'] as num?)?.toInt() ?? 5,
          ),
    adjustment: switch (json['adjustment']) {
      final Map<String, dynamic> a => adjustmentFromJson(a),
      _ => null,
    },
    collection: switch (json['collection']) {
      final Map<String, dynamic> c => TripCollection(
          totalCents: _cents(c['total']),
          payments: [
            for (final p in (c['payments'] as List? ?? const []).cast<Map<String, dynamic>>())
              CollectedPayment(paymentMethod: p['paymentMethod'] as String, amountCents: _cents(p['amount'])),
          ],
        ),
      _ => null,
    },
  );
}

CourierCashDay cashDayFromJson(Map<String, dynamic> json) {
  final box = json['box'] as Map<String, dynamic>?;
  return CourierCashDay(
    date: json['date'] as String,
    today: json['today'] as String,
    fundingMode: json['fundingMode'] as String?,
    requiresOpening: json['requiresOpening'] as bool? ?? false,
    canReceiveOffers: json['canReceiveOffers'] as bool? ?? true,
    box: box == null ? null : _cashBox(box),
  );
}

CashBox _cashBox(Map<String, dynamic> json) {
  final closure = json['closure'] as Map<String, dynamic>?;
  final closer = closure?['closedBy'] as Map<String, dynamic>?;
  final balance = json['balance'] as Map<String, dynamic>;
  List<Map<String, dynamic>> list(String key) => (json[key] as List? ?? const []).cast<Map<String, dynamic>>();
  return CashBox(
    id: json['id'] as String,
    businessDate: json['businessDate'] as String,
    fundingMode: json['fundingMode'] as String?,
    closure: closure == null
        ? null
        : CashClosure(
            closedAt: DateTime.parse(closure['closedAt'] as String),
            closedBy: [closer?['givenNames'], closer?['familyNames']].whereType<String>().join(' '),
            notes: closure['notes'] as String?,
          ),
    totals: [
      for (final t in list('totals')) CashTotal(type: t['type'] as String, signedCents: parseSignedCents(t['signed']), count: (t['count'] as num).toInt()),
    ],
    balance: CashBalance(
      movementsNetCents: parseSignedCents(balance['movementsNet']),
      courierFeesCents: parseSignedCents(balance['courierFees']),
      commissionsCents: parseSignedCents(balance['commissions']),
      amountDueCents: parseSignedCents(balance['amountDue']),
      settledOrders: (balance['settledOrders'] as num?)?.toInt() ?? 0,
    ),
    movements: [
      for (final m in list('movements'))
        CashMovement(
          id: m['id'] as String,
          type: m['type'] as String,
          signedCents: parseSignedCents(m['signed']),
          paymentMethod: m['paymentMethod'] as String?,
          orderCode: m['orderCode'] as String?,
          note: m['note'] as String?,
          createdAt: DateTime.parse(m['createdAt'] as String),
          reversed: m['reversedById'] != null,
          reverses: m['reversesMovementId'] != null,
        ),
    ],
    orders: [
      for (final o in list('orders'))
        CashOrder(
          code: o['code'] as String,
          storeName: o['storeName'] as String,
          feeCents: _cents(o['deliveryFee']),
          commissionCents: _cents(o['commission']),
          counted: o['counted'] as bool? ?? true,
        ),
    ],
    uncollected: [
      for (final u in list('uncollected')) CashUncollected(code: u['code'] as String, storeName: u['storeName'] as String, customerTotalCents: _cents(u['customerTotal'])),
    ],
  );
}
