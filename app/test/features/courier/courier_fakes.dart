import 'dart:typed_data';

import 'package:rapichonta/core/error/failure.dart';
import 'package:rapichonta/features/courier/domain/courier.dart';
import 'package:rapichonta/features/orders/domain/entities/adjustment.dart';

Uint8List bytesOf(List<int> bytes) => Uint8List.fromList(bytes);

/// Cabecera JPEG mínima (lo que se mira para reconocer el tipo).
final jpeg = bytesOf([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);

typedef SentStep = ({String kind, String code, bool queued, String? receipt});

/// El código de entrega del pedido de prueba.
const fakeDeliveryCode = '4821';

/// La API del domiciliario en memoria: registra lo enviado y simula red caída o rechazos.
class FakeCourierRepository implements CourierRepository {
  FakeCourierRepository({this.currentStatus = const CourierStatus(verified: true, locationConsentPending: false, availableSince: null), this.currentTrip, this.currentOffers = const []});

  CourierStatus currentStatus;
  Trip? currentTrip;
  List<CourierOffer> currentOffers;

  /// Sin red para todo.
  bool offline = false;

  /// La foto sube, pero los pasos no salen.
  bool offlineSteps = false;

  /// Código con el que la API rechaza el próximo paso.
  String? rejectNext;

  int uploads = 0;
  int codeAttemptsLeft = 5;
  final steps = <SentStep>[];

  /// Las líneas de cada pregunta al cliente que envió (E09).
  final reported = <List<ReportedLine>>[];
  final availability = <bool>[];

  static const _network = Failure('Sin conexión', code: 'NETWORK_ERROR');

  void _online() {
    if (offline) throw _network;
  }

  @override
  Future<CourierStatus> status() async => currentStatus;

  @override
  Future<CourierStatus> setAvailable(bool available) async {
    _online();
    availability.add(available);
    return currentStatus = CourierStatus(
      verified: currentStatus.verified,
      locationConsentPending: false,
      availableSince: available ? DateTime.utc(2026, 10, 21, 20, 40) : null,
      activeOrder: currentStatus.activeOrder,
    );
  }

  @override
  Future<({int accepted, ({String orderCode, String status})? arrival})> reportLocations(List<LocationReading> readings) async {
    _online();
    return (accepted: readings.length, arrival: null);
  }

  @override
  Future<List<CourierOffer>> offers({required String language}) async => currentOffers;

  @override
  Future<String> accept(String offerId) async => currentOffers.firstWhere((o) => o.offerId == offerId).orderCode;

  @override
  Future<void> reject(String offerId) async {}

  @override
  Future<Trip?> trip({required String language}) async => currentTrip;

  @override
  Future<String> uploadReceipt(ReceiptPhoto photo) async {
    _online();
    uploads++;
    return 'file-$uploads';
  }

  @override
  Future<String> uploadDeliveryProof(ReceiptPhoto photo) async {
    _online();
    uploads++;
    return 'proof-$uploads';
  }

  Future<StepOutcome> _record(String kind, String code, TripStepEvent event, [String? receipt]) async {
    _online();
    if (offlineSteps) throw _network;
    final rejection = rejectNext;
    if (rejection != null) {
      rejectNext = null;
      throw Failure('', code: rejection);
    }
    steps.add((kind: kind, code: code, queued: event.queued, receipt: receipt));
    return (status: null, replayed: false);
  }

  @override
  Future<StepOutcome> purchase(String code, TripStepEvent event, {required String amount, required String receiptFileId}) => _record('purchase', code, event, receiptFileId);

  @override
  Future<StepOutcome> ready(String code, TripStepEvent event) => _record('ready', code, event);

  @override
  Future<StepOutcome> delay(String code, TripStepEvent event) => _record('delay', code, event);

  @override
  Future<StepOutcome> reportAdjustment(String code, TripStepEvent event, {required List<ReportedLine> lines}) async {
    final outcome = await _record('adjustments', code, event);
    reported.add(lines);
    return outcome;
  }

  @override
  Future<StepOutcome> arrived(String code, TripStepEvent event) => _record('arrived', code, event);

  @override
  Future<StepOutcome> deliver(String code, TripStepEvent event, {required String deliveryCode}) async {
    _online();
    if (offlineSteps) throw _network;
    if (deliveryCode != fakeDeliveryCode) {
      codeAttemptsLeft--;
      throw Failure('', code: 'DELIVERY_CODE_WRONG', details: {'attemptsLeft': codeAttemptsLeft});
    }
    return _record('deliver', code, event);
  }

  @override
  Future<StepOutcome> proof(String code, TripStepEvent event, {required String fileId}) => _record('proof', code, event, fileId);
}

Map<String, dynamic> tripJson({required String status, bool revealed = false, bool prepared = false, Map<String, dynamic>? delivery, Map<String, dynamic>? adjustment}) => {
      'code': 'RC-7K3M',
      'status': status,
      'statusAt': '2026-10-21T20:30:00.000Z',
      'acceptedAt': '2026-10-21T20:20:00.000Z',
      'establishment': {
        'name': 'Asadero El Chontaduro',
        'addressLine': 'Calle 5 # 3-20, Centro',
        'phone': '+573101234567',
        'latitude': 1.0295,
        'longitude': -76.6158,
        'area': [
          {'latitude': 1.0293, 'longitude': -76.6160},
          {'latitude': 1.0297, 'longitude': -76.6160},
          {'latitude': 1.0297, 'longitude': -76.6156},
          {'latitude': 1.0293, 'longitude': -76.6156},
        ],
      },
      'zone': {'name': 'Centro', 'kind': 'URBAN'},
      'lines': [
        {'id': 'item-pollo', 'name': 'Pollo asado entero', 'quantity': 1, 'unitPrice': '32500.00', 'notes': 'Bien dorado'},
        {'id': 'item-gaseosa', 'name': 'Gaseosa 1.5 L', 'quantity': 2, 'unitPrice': '3000.00', 'notes': null},
      ],
      'itemsTotal': '38500.00',
      'deliveryFee': '3000.00',
      'customerTotal': '41500.00',
      'paymentMethod': 'NEQUI',
      'notes': 'Timbre dañado, llamar',
      'destination': revealed
          ? {
              'label': 'Casa',
              'line': 'Carrera 4 # 7-15',
              'reference': 'Portón verde frente al parque',
              'latitude': 1.031,
              'longitude': -76.612,
              'recipientName': 'Rosa Mutumbajoy',
              'recipientPhone': '+573124567890',
            }
          : null,
      'preparation': prepared
          ? {'startedAt': '2026-10-21T20:30:00.000Z', 'estimatedReadyAt': '2026-10-21T20:45:00.000Z', 'delayCount': 1, 'nextCheckAt': '2026-10-21T20:50:00.000Z'}
          : null,
      'purchase': prepared ? {'amount': '39000.00', 'receiptUrl': null} : null,
      'delivery': delivery,
      'adjustment': adjustment,
    };

/// Una pregunta al cliente (E09) sobre las dos líneas del pedido de prueba: la gaseosa se acabó y el pollo cambió
/// de precio. [decisions] son las respuestas por línea (null: aún sin responder).
Map<String, dynamic> adjustmentJson({required bool open, String? gaseosa, String? pollo, DateTime? expiresAt}) => {
      'id': 'req-1',
      'reportedAt': '2026-10-21T20:31:00.000Z',
      'expiresAt': (expiresAt ?? DateTime.utc(2026, 10, 21, 20, 34)).toIso8601String(),
      'open': open,
      'lines': [
        {
          'id': 'adj-gaseosa',
          'orderItemId': 'item-gaseosa',
          'name': 'Gaseosa 1.5 L',
          'quantity': 2,
          'unitPrice': '3000.00',
          'reason': 'UNAVAILABLE',
          'reportedUnitPrice': null,
          'decision': gaseosa,
          'decidedAt': gaseosa == null ? null : '2026-10-21T20:32:00.000Z',
          'substitute': gaseosa == 'SUBSTITUTE' ? {'name': 'Jugo de lulo 1 L', 'quantity': 2, 'unitPrice': '3500.00'} : null,
          'options': gaseosa == null ? ['SUBSTITUTE', 'REMOVE_ITEM', 'CANCEL_ORDER'] : <String>[],
        },
        {
          'id': 'adj-pollo',
          'orderItemId': 'item-pollo',
          'name': 'Pollo asado entero',
          'quantity': 1,
          'unitPrice': '32500.00',
          'reason': 'PRICE_CHANGED',
          'reportedUnitPrice': '34500.00',
          'decision': pollo,
          'decidedAt': pollo == null ? null : '2026-10-21T20:32:30.000Z',
          'substitute': null,
          'options': pollo == null ? ['ACCEPT_PRICE', 'REMOVE_ITEM', 'CANCEL_ORDER'] : <String>[],
        },
      ],
    };

Map<String, dynamic> offerJson({DateTime? expiresAt}) => {
      'offerId': 'offer-1',
      'orderCode': 'RC-7K3M',
      'expiresAt': (expiresAt ?? DateTime.now().add(const Duration(seconds: 45))).toUtc().toIso8601String(),
      'establishment': {'name': 'Asadero El Chontaduro', 'addressLine': 'Calle 5 # 3-20, Centro', 'latitude': 1.0295, 'longitude': -76.6158},
      'zone': {'name': 'Centro', 'kind': 'URBAN'},
      'itemCount': 3,
      'lines': [
        {'name': 'Pollo asado entero', 'quantity': 1, 'notes': 'Bien dorado'},
        {'name': 'Gaseosa 1.5 L', 'quantity': 2, 'notes': null},
      ],
      'itemsTotal': '38500.00',
      'deliveryFee': '3000.00',
      'paymentMethod': 'CASH',
      'distanceMeters': 640,
    };
