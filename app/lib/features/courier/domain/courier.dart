import 'package:equatable/equatable.dart';

import '../../establishments/domain/entities/establishment.dart';
import '../../orders/domain/entities/adjustment.dart';

/// Modo domiciliario (E07 + E08). Montos en centavos; estados, zonas y medios de pago son códigos del
/// catálogo de la API que la app traduce. La ubicación la decide el servidor: la app solo la reporta.

/// GET /courier/status.
class CourierStatus extends Equatable {
  const CourierStatus({
    required this.verified,
    required this.locationConsentPending,
    required this.availableSince,
    this.activeOrder,
    this.lastLocationAt,
    this.locationFresh = false,
  });

  final bool verified;
  final bool locationConsentPending;
  final DateTime? availableSince;

  /// El pedido que lleva ahora (código y estado), o null.
  final ({String code, String status})? activeOrder;

  /// La última ubicación que recibió la API (hora del servidor).
  final DateTime? lastLocationAt;

  /// La API recibió su ubicación hace poco: el panel lo ve y le puede ofrecer pedidos.
  final bool locationFresh;

  bool get available => availableSince != null;

  /// Mientras esté disponible o con un pedido, el teléfono reporta su ubicación (H08.1, H08.3).
  bool get tracking => available || activeOrder != null;

  @override
  List<Object?> get props => [verified, locationConsentPending, availableSince, activeOrder, lastLocationAt, locationFresh];
}

class TripLine extends Equatable {
  const TripLine({required this.name, required this.quantity, this.notes, this.id, this.unitCents = 0});

  /// La línea del pedido, para reportar un faltante (solo en el pedido en curso; las ofertas no la traen).
  final String? id;
  final String name;
  final int quantity;
  final String? notes;

  /// Precio por unidad que pagó el cliente (para comparar con el que pide el local).
  final int unitCents;

  @override
  List<Object?> get props => [id, name, quantity, notes, unitCents];
}

/// Pedido ofrecido (H08.2): lo justo para decidir si lo toma.
class CourierOffer extends Equatable {
  const CourierOffer({
    required this.offerId,
    required this.orderCode,
    required this.expiresAt,
    required this.storeName,
    required this.storeAddress,
    required this.storeLocation,
    required this.zoneName,
    required this.lines,
    required this.itemsCents,
    required this.feeCents,
    required this.paymentMethod,
    this.distanceMeters,
  });

  final String offerId;
  final String orderCode;
  final DateTime expiresAt;
  final String storeName;
  final String storeAddress;
  final GeoPoint storeLocation;
  final String zoneName;
  final List<TripLine> lines;
  final int itemsCents;
  final int feeCents;
  final String paymentMethod;
  final int? distanceMeters;

  int get itemCount => lines.fold(0, (sum, l) => sum + l.quantity);

  @override
  List<Object?> get props => [offerId, expiresAt];
}

/// Dónde se entrega: la API lo revela solo cuando el pedido sale del local (ON_THE_WAY en adelante).
class TripDestination extends Equatable {
  const TripDestination({required this.location, required this.recipientName, this.label, this.line, this.reference, this.recipientPhone});

  final GeoPoint location;
  final String? label;
  final String? line;
  final String? reference;
  final String recipientName;
  final String? recipientPhone;

  @override
  List<Object?> get props => [location, label, line, reference, recipientName, recipientPhone];
}

class TripPreparation extends Equatable {
  const TripPreparation({required this.startedAt, required this.estimatedReadyAt, required this.delayCount, required this.nextCheckAt});

  final DateTime startedAt;
  final DateTime estimatedReadyAt;
  final int delayCount;

  /// Cuándo vuelve a preguntar "¿ya está listo?".
  final DateTime nextCheckAt;

  @override
  List<Object?> get props => [startedAt, estimatedReadyAt, delayCount, nextCheckAt];
}

/// Donde el cliente: cuándo llegó, desde cuándo puede entregar con foto y cuántos códigos le quedan.
class TripDelivery extends Equatable {
  const TripDelivery({this.arrivedAt, this.proofAvailableAt, this.codeAttemptsLeft = 5});

  final DateTime? arrivedAt;

  /// Sin código, la foto se habilita a esta hora (antes, si se acabaron los intentos del código).
  final DateTime? proofAvailableAt;
  final int codeAttemptsLeft;

  @override
  List<Object?> get props => [arrivedAt, proofAvailableAt, codeAttemptsLeft];
}

/// El pedido en curso del domiciliario (GET /courier/trip).
class Trip extends Equatable {
  const Trip({
    required this.code,
    required this.status,
    required this.statusAt,
    required this.acceptedAt,
    required this.storeName,
    required this.storeAddress,
    required this.storeLocation,
    required this.storeArea,
    required this.zoneName,
    required this.lines,
    required this.itemsCents,
    required this.feeCents,
    required this.customerTotalCents,
    required this.paymentMethod,
    this.storePhone,
    this.notes,
    this.destination,
    this.preparation,
    this.purchase,
    this.delivery,
    this.adjustment,
    this.collection,
  });

  final String code;
  final String status;
  final DateTime statusAt;
  final DateTime acceptedAt;
  final String storeName;
  final String storeAddress;
  final String? storePhone;
  final GeoPoint storeLocation;

  /// Geocerca del local dibujada en el panel (H03.1); al entrar en ella el pedido avanza solo.
  final List<GeoPoint> storeArea;
  final String zoneName;
  final List<TripLine> lines;
  final int itemsCents;
  final int feeCents;

  /// Lo que se le cobra al cliente al entregar (productos + domicilio).
  final int customerTotalCents;
  final String paymentMethod;
  final String? notes;
  final TripDestination? destination;
  final TripPreparation? preparation;
  final ({int amountCents, String? receiptUrl})? purchase;
  final TripDelivery? delivery;

  /// La última pregunta al cliente en este local (E09): abierta mientras espera, o con lo que decidió.
  final OrderAdjustment? adjustment;

  /// H10.2: lo que el cliente pagó en la puerta, ya registrado (null mientras no se cobra).
  final TripCollection? collection;

  @override
  List<Object?> get props => [code, status, statusAt, lines, destination, preparation, purchase, delivery, adjustment, collection];
}

// ── H10.2 · Cobro contra entrega ──

/// Un pago tal como lo marca el domiciliario: el medio (código del catálogo) y cuánto, en centavos. Si el
/// cliente pagó parte en efectivo y parte por Nequi, son dos pagos.
class CollectedPayment extends Equatable {
  const CollectedPayment({required this.paymentMethod, required this.amountCents});

  final String paymentMethod;
  final int amountCents;

  /// Pesos en texto decimal para la API (RNF-05): "38500" o "38500.50".
  Map<String, dynamic> toJson() => {
        'paymentMethod': paymentMethod,
        'amount': amountCents % 100 == 0 ? '${amountCents ~/ 100}' : '${amountCents ~/ 100}.${(amountCents % 100).toString().padLeft(2, '0')}',
      };

  @override
  List<Object?> get props => [paymentMethod, amountCents];
}

class TripCollection extends Equatable {
  const TripCollection({required this.totalCents, required this.payments});

  final int totalCents;
  final List<CollectedPayment> payments;

  @override
  List<Object?> get props => [totalCents, payments];
}

/// Una cuenta propia del domiciliario donde le pagan con QR (Nequi, Daviplata, transferencia). La crea el
/// panel; desde la app solo se pone la imagen del QR que le dio su banco.
class CollectionAccount extends Equatable {
  const CollectionAccount({
    required this.id,
    required this.paymentMethod,
    required this.accountNumber,
    required this.holderName,
    this.bank,
    this.accountType,
    this.qrUrl,
  });

  final String id;
  final String paymentMethod;
  final String? bank;
  final String? accountType;
  final String accountNumber;
  final String holderName;

  /// URL firmada de la imagen del QR (vence sola); null si aún no la sube.
  final String? qrUrl;

  @override
  List<Object?> get props => [id, paymentMethod, accountNumber, qrUrl];
}

/// Lo que entregó en las últimas 24 horas sin decir cómo le pagaron: la caja del día no cierra sin eso.
class PendingCollection extends Equatable {
  const PendingCollection({
    required this.code,
    required this.status,
    required this.storeName,
    required this.customerTotalCents,
    required this.paymentMethod,
    required this.closedAt,
  });

  final String code;
  final String status;
  final String storeName;
  final int customerTotalCents;

  /// El medio que el cliente dijo que usaría al pedir (el más probable).
  final String paymentMethod;
  final DateTime closedAt;

  @override
  List<Object?> get props => [code, status, closedAt];
}

/// Reglas del cobro en la puerta, para la vista y las pruebas (la API las vuelve a revisar).
abstract final class CollectionRules {
  /// Efectivo + un medio de cuenta es lo normal; más de tres medios no tiene sentido en la puerta.
  static const maxPayments = 3;

  /// Los medios con los que puede cobrar: el efectivo siempre, los de cuenta solo si tiene la cuenta.
  static List<String> methods(Iterable<CollectionAccount> accounts) => ['CASH', ...{for (final a in accounts) a.paymentMethod}];

  /// Por qué no se puede registrar todavía (null si está bien): sin pagos, montos en cero o un medio repetido.
  static String? problem(List<CollectedPayment> payments) {
    if (payments.isEmpty) return 'EMPTY';
    if (payments.length > maxPayments) return 'TOO_MANY';
    if (payments.any((p) => p.amountCents <= 0)) return 'AMOUNT';
    if (payments.map((p) => p.paymentMethod).toSet().length != payments.length) return 'REPEATED_METHOD';
    return null;
  }

  static int total(Iterable<CollectedPayment> payments) => payments.fold(0, (sum, p) => sum + p.amountCents);
}

/// Una lectura del GPS tal como la entrega el teléfono.
class LocationReading {
  const LocationReading({required this.point, required this.recordedAt, this.accuracyM, this.mocked = false});

  final GeoPoint point;
  final DateTime recordedAt;
  final double? accuracyM;
  final bool mocked;

  Map<String, dynamic> toJson() => {
        'latitude': point.lat,
        'longitude': point.lng,
        if (accuracyM != null) 'accuracyM': double.parse(accuracyM!.toStringAsFixed(1)),
        'recordedAt': recordedAt.toUtc().toIso8601String(),
        if (mocked) 'mocked': true,
      };
}

/// Respuesta de un paso del pedido: `replayed` si la API ya lo tenía (reenvío de la cola sin señal).
typedef StepOutcome = ({String? status, bool replayed});

/// Foto (de la factura o de la entrega) lista para subir: bytes JPEG/PNG/WebP con su tipo.
class ReceiptPhoto {
  const ReceiptPhoto({required this.bytes, required this.mimeType});

  final List<int> bytes;
  final String mimeType;
}

/// Puerto del lado del domiciliario. Un adaptador HTTP (data/).
/// Ruta por las calles hasta el local o la puerta del cliente (la traza la API con OpenStreetMap).
class TripRoute extends Equatable {
  const TripRoute({required this.towardsCustomer, required this.line, required this.distanceMeters, required this.durationSeconds});

  final bool towardsCustomer;
  final List<GeoPoint> line;
  final double distanceMeters;
  final double durationSeconds;

  @override
  List<Object?> get props => [towardsCustomer, line, distanceMeters, durationSeconds];
}

/// La API responde `{route: null}` si el paso no tiene a dónde ir, y `{route: {target, route: null}}` si el
/// servicio de rutas no respondió: en los dos casos no hay línea que dibujar.
TripRoute? tripRouteFromJson(Map<String, dynamic>? json) {
  final planned = json?['route'] as Map<String, dynamic>?;
  if (planned == null) return null;
  return TripRoute(
    towardsCustomer: json!['target'] == 'CUSTOMER',
    line: [for (final p in (planned['line'] as List).cast<List>()) GeoPoint((p[1] as num).toDouble(), (p[0] as num).toDouble())],
    distanceMeters: (planned['distanceMeters'] as num).toDouble(),
    durationSeconds: (planned['durationSeconds'] as num).toDouble(),
  );
}

abstract interface class CourierRepository {
  Future<CourierStatus> status();
  Future<CourierStatus> setAvailable(bool available);

  /// Devuelve si con estas lecturas el servidor marcó una llegada (al local o donde el cliente).
  Future<({int accepted, ({String orderCode, String status})? arrival})> reportLocations(List<LocationReading> readings);

  Future<List<CourierOffer>> offers({required String language});

  /// "Tomar pedido": el código del pedido que ahora lleva.
  Future<String> accept(String offerId);
  Future<void> reject(String offerId);

  Future<Trip?> trip({required String language});

  /// Ruta desde [from] (su GPS) hasta el destino del paso en curso; null si no hay.
  Future<TripRoute?> route(String code, GeoPoint from);

  /// Sube la factura (tres pasos de /files/uploads) y devuelve el id del archivo.
  Future<String> uploadReceipt(ReceiptPhoto photo);

  /// Igual, para la foto de la entrega (propósito DELIVERY_PROOF).
  Future<String> uploadDeliveryProof(ReceiptPhoto photo);

  Future<StepOutcome> purchase(String code, TripStepEvent event, {required String amount, required String receiptFileId});
  Future<StepOutcome> ready(String code, TripStepEvent event);
  Future<StepOutcome> delay(String code, TripStepEvent event);

  /// "Falta algo / cambió el precio": una sola pregunta al cliente con todas las líneas marcadas (H09.2).
  Future<StepOutcome> reportAdjustment(String code, TripStepEvent event, {required List<ReportedLine> lines});

  /// "Llegué" (si la geocerca no lo detectó).
  Future<StepOutcome> arrived(String code, TripStepEvent event);

  /// Entrega con el código del cliente. Necesita señal: el servidor lo compara.
  Future<StepOutcome> deliver(String code, TripStepEvent event, {required String deliveryCode});

  /// Entrega con foto cuando el cliente no dio el código.
  Future<StepOutcome> proof(String code, TripStepEvent event, {required String fileId});

  /// H10.2: cómo le pagó el cliente. Sirve antes o después de entregar (el pedido no tiene que seguir con él).
  Future<StepOutcome> collect(String code, TripStepEvent event, {required List<CollectedPayment> payments});

  Future<List<CollectionAccount>> collectionAccounts();

  /// Lo entregado en las últimas 24 horas sin cobro registrado.
  Future<List<PendingCollection>> pendingCollections();

  /// Sube la imagen del QR de su cuenta (propósito COLLECTION_QR) y la deja en la cuenta.
  Future<CollectionAccount> setAccountQr(String accountId, ReceiptPhoto photo);
}

/// Id del paso (para no repetirlo si se reenvía) y, desde la cola sin señal, la hora en que ocurrió.
class TripStepEvent {
  const TripStepEvent({required this.clientEventId, required this.occurredAt, required this.queued});

  final String clientEventId;
  final DateTime occurredAt;
  final bool queued;

  Map<String, dynamic> toJson() => {
        'clientEventId': clientEventId,
        if (queued) ...{'occurredAt': occurredAt.toUtc().toIso8601String(), 'queued': true},
      };
}
