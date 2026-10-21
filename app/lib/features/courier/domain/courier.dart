import 'package:equatable/equatable.dart';

import '../../establishments/domain/entities/establishment.dart';

/// Modo domiciliario (E07 + E08). Montos en centavos; estados, zonas y medios de pago son códigos del
/// catálogo de la API que la app traduce. La ubicación la decide el servidor: la app solo la reporta.

/// GET /courier/status.
class CourierStatus extends Equatable {
  const CourierStatus({required this.verified, required this.locationConsentPending, required this.availableSince, this.activeOrder});

  final bool verified;
  final bool locationConsentPending;
  final DateTime? availableSince;

  /// El pedido que lleva ahora (código y estado), o null.
  final ({String code, String status})? activeOrder;

  bool get available => availableSince != null;

  /// Mientras esté disponible o con un pedido, el teléfono reporta su ubicación (H08.1, H08.3).
  bool get tracking => available || activeOrder != null;

  @override
  List<Object?> get props => [verified, locationConsentPending, availableSince, activeOrder];
}

class TripLine extends Equatable {
  const TripLine({required this.name, required this.quantity, this.notes});

  final String name;
  final int quantity;
  final String? notes;

  @override
  List<Object?> get props => [name, quantity, notes];
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

  @override
  List<Object?> get props => [code, status, statusAt, destination, preparation, purchase];
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

/// Foto de la factura lista para subir: bytes JPEG/PNG/WebP con su tipo.
class ReceiptPhoto {
  const ReceiptPhoto({required this.bytes, required this.mimeType});

  final List<int> bytes;
  final String mimeType;
}

/// Puerto del lado del domiciliario. Un adaptador HTTP (data/).
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

  /// Sube la factura (tres pasos de /files/uploads) y devuelve el id del archivo.
  Future<String> uploadReceipt(ReceiptPhoto photo);

  Future<StepOutcome> purchase(String code, TripStepEvent event, {required String amount, required String receiptFileId});
  Future<StepOutcome> ready(String code, TripStepEvent event);
  Future<StepOutcome> delay(String code, TripStepEvent event);
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
