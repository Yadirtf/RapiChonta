import 'package:equatable/equatable.dart';

import '../../../establishments/domain/entities/establishment.dart';
import 'adjustment.dart';

/// Pedido del cliente (E04). Los montos van en centavos; los estados y medios de pago son códigos del
/// catálogo de la API que la app traduce (uno nuevo se ve con su código hasta tener texto propio).

/// Un medio en "¿Cómo pagas al recibir?". El panel decide cuáles se ven, en qué orden y con qué imagen.
class PaymentOption extends Equatable {
  const PaymentOption(this.code, {this.imageUrl});

  final String code;
  final String? imageUrl;

  @override
  List<Object?> get props => [code, imageUrl];
}

class SavedAddress extends Equatable {
  const SavedAddress({required this.id, required this.location, this.label, this.line, this.reference, this.isDefault = false});

  final String id;
  final String? label;
  final String? line;
  final String? reference;
  final GeoPoint location;
  final bool isDefault;

  @override
  List<Object?> get props => [id, label, line, reference, location, isDefault];
}

class SavedRecipient extends Equatable {
  const SavedRecipient({required this.id, required this.fullName, required this.phone});

  final String id;
  final String fullName;
  final String phone;

  @override
  List<Object?> get props => [id, fullName, phone];
}

/// Dónde se entrega: un lugar guardado o un punto del mapa (la referencia se exige al confirmar).
sealed class DeliveryTarget {
  const DeliveryTarget();
  Map<String, dynamic> toJson();
}

class SavedPlace extends DeliveryTarget {
  const SavedPlace(this.addressId);
  final String addressId;

  @override
  Map<String, dynamic> toJson() => {'addressId': addressId};
}

class MapPoint extends DeliveryTarget {
  const MapPoint(this.point, {this.reference, this.line, this.label});

  final GeoPoint point;
  final String? reference;
  final String? line;

  /// Con nombre ("Casa") se guarda para la próxima vez.
  final String? label;

  @override
  Map<String, dynamic> toJson() => {
        // Siete decimales (~1 cm): el mismo punto no se vuelve a cotizar por ruido del mapa.
        'latitude': (point.lat * 1e7).round() / 1e7,
        'longitude': (point.lng * 1e7).round() / 1e7,
        if (reference != null) 'reference': reference,
        if (line != null) 'line': line,
        if (label != null) 'label': label,
      };
}

/// Quién recibe: el cliente (null), alguien a quien ya le envió o una persona nueva.
sealed class RecipientChoice {
  const RecipientChoice();
  Map<String, dynamic> toJson();
}

class KnownRecipient extends RecipientChoice {
  const KnownRecipient(this.recipientId);
  final String recipientId;

  @override
  Map<String, dynamic> toJson() => {'recipientId': recipientId};
}

class NewRecipient extends RecipientChoice {
  const NewRecipient({required this.fullName, required this.phoneE164});
  final String fullName;
  final String phoneE164;

  @override
  Map<String, dynamic> toJson() => {'fullName': fullName, 'phone': phoneE164};
}

class NewCustomerLimit extends Equatable {
  const NewCustomerLimit({required this.limitCents, required this.availableCents, required this.exceeded});

  final int limitCents;

  /// Lo que queda después de los pedidos en curso.
  final int availableCents;
  final bool exceeded;

  @override
  List<Object?> get props => [limitCents, availableCents, exceeded];
}

class OrderQuote extends Equatable {
  const OrderQuote({
    required this.itemsCents,
    required this.feeCents,
    required this.totalCents,
    required this.prepMinutes,
    required this.zoneName,
    this.newCustomerLimit,
    this.fulfillmentModes = const [defaultFulfillmentMode],
  });

  final int itemsCents;
  final int feeCents;
  final int totalCents;
  final int prepMinutes;
  final String zoneName;
  final NewCustomerLimit? newCustomerLimit;

  /// E15: cómo puede surtirse el pedido en este local; el primero es el que se sugiere. Más de uno solo en un
  /// comercio aliado, donde el cliente elige.
  final List<String> fulfillmentModes;

  @override
  List<Object?> get props => [itemsCents, feeCents, totalCents, zoneName, newCustomerLimit, fulfillmentModes];
}

/// E15: el comercio aliado recibe el pedido, lo prepara y el domiciliario lo recoge.
const directFulfillmentMode = 'MERCHANT_DIRECT';

/// La compra de siempre: el domiciliario va al local y compra por el cliente.
const defaultFulfillmentMode = 'COURIER_PURCHASE';

class OrderSummary extends Equatable {
  const OrderSummary({
    required this.code,
    required this.establishmentId,
    required this.establishmentName,
    required this.createdAt,
    required this.status,
    required this.statusAt,
    required this.active,
    required this.itemCount,
    required this.totalCents,
    this.logoUrl,
    this.fulfillmentMode = defaultFulfillmentMode,
  });

  final String code;
  final String establishmentId;
  final String establishmentName;
  final String? logoUrl;
  final DateTime createdAt;
  final String status;
  final DateTime statusAt;
  final bool active;
  final int itemCount;
  final int totalCents;
  final String fulfillmentMode;

  @override
  List<Object?> get props => [code, status, statusAt, active, fulfillmentMode];
}

class OrderLine extends Equatable {
  const OrderLine({required this.productId, required this.name, required this.unitCents, required this.quantity, this.notes});

  final String productId;
  final String name;
  final int unitCents;
  final int quantity;
  final String? notes;

  int get subtotalCents => unitCents * quantity;

  @override
  List<Object?> get props => [productId, unitCents, quantity, notes];
}

class TimelineEntry extends Equatable {
  const TimelineEntry(this.status, this.at);
  final String status;
  final DateTime at;

  @override
  List<Object?> get props => [status, at];
}

class OrderDetail extends OrderSummary {
  const OrderDetail({
    required super.code,
    required super.establishmentId,
    required super.establishmentName,
    super.logoUrl,
    required super.createdAt,
    required super.status,
    required super.statusAt,
    required super.active,
    required super.itemCount,
    required super.totalCents,
    super.fulfillmentMode,
    required this.lines,
    required this.itemsCents,
    required this.feeCents,
    required this.prepMinutes,
    required this.zoneName,
    required this.address,
    required this.paymentMethod,
    required this.timeline,
    required this.journey,
    this.recipient,
    this.notes,
    this.preparation,
    this.purchase,
    this.delivery = const OrderDelivery(),
    this.adjustments = const [],
    this.incident,
    this.cancellationReason,
    this.merchant,
  });

  final List<OrderLine> lines;
  final int itemsCents;
  final int feeCents;
  final int prepMinutes;
  final String zoneName;
  final SavedAddress address;
  final ({String fullName, String? phone})? recipient;
  final String paymentMethod;
  final String? notes;
  final List<TimelineEntry> timeline;

  /// Hitos del recorrido normal, en orden (los define la API).
  final List<String> journey;

  /// Mientras se prepara (E08): la hora estimada y si el domiciliario avisó que va con retraso (alta demanda).
  final ({DateTime estimatedReadyAt, bool delayed})? preparation;

  /// Lo que el domiciliario pagó en el local, con la foto de la factura (H08.4).
  final ({int amountCents, String? receiptUrl})? purchase;

  /// El cierre: el código para el domiciliario, la foto si entregó sin código y hasta cuándo se puede reclamar.
  final OrderDelivery delivery;

  /// Las preguntas del domiciliario desde el local (E09), de la más reciente a la más vieja.
  final List<OrderAdjustment> adjustments;

  /// H10.3: el caso abierto por "No lo recibí" (o por el operador al revisar la foto), con cómo va.
  final OrderIncident? incident;

  /// Código de cancellation_reasons si se canceló (lo explica la app con su texto).
  final String? cancellationReason;

  /// Pedido directo (E15): a qué hora dijo el comercio que estaría y si ya lo marcó listo.
  final ({DateTime estimatedReadyAt, DateTime? readyAt})? merchant;

  @override
  List<Object?> get props => [...super.props, timeline, preparation, purchase, delivery, adjustments, incident, cancellationReason, merchant];
}

/// Un caso del pedido: cuándo se reportó, cuándo alguien de RapiChonta lo tomó y cómo terminó.
class OrderIncident extends Equatable {
  const OrderIncident({required this.status, required this.reportedAt, this.reviewStartedAt, this.resolvedAt, this.resolution});

  /// OPEN, IN_REVIEW o RESOLVED (incident_statuses).
  final String status;
  final DateTime reportedAt;
  final DateTime? reviewStartedAt;
  final DateTime? resolvedAt;

  /// RESOLVED_AS_DELIVERED, RESOLVED_AS_CANCELLED o NO_ORDER_CHANGE (incident_resolution_types).
  final String? resolution;

  @override
  List<Object?> get props => [status, reviewStartedAt, resolvedAt, resolution];
}

/// Lo que el cliente puede contar al decir "No lo recibí" (la API recorta lo demás).
const maxNotReceivedDescription = 500;

/// El cierre de la entrega visto por el cliente.
class OrderDelivery extends Equatable {
  const OrderDelivery({this.code, this.proofUrl, this.reviewClosesAt});

  /// 4 dígitos para decirle al domiciliario al recibir (solo mientras va en camino o llegando).
  final String? code;

  /// La foto que tomó el domiciliario si entregó sin código.
  final String? proofUrl;

  /// Si nadie reclama antes de esta hora, el pedido queda entregado.
  final DateTime? reviewClosesAt;

  @override
  List<Object?> get props => [code, proofUrl, reviewClosesAt];
}

class OrderHistory {
  const OrderHistory({required this.active, required this.past, required this.journey, this.journeys = const {}, this.nextBefore});

  final List<OrderSummary> active;
  final List<OrderSummary> past;
  final String? nextBefore;
  final List<String> journey;

  /// E15: el recorrido de cada modo (el directo espera al comercio y no pasa por la compra).
  final Map<String, List<String>> journeys;

  List<String> journeyOf(OrderSummary order) => journeys[order.fulfillmentMode] ?? journey;
}

enum StopState { done, current, upcoming }

typedef RouteStop = ({String status, StopState state, DateTime? at});

/// Reglas del pedido para la vista, puras para poder probarlas.
abstract final class OrderRules {
  /// La ruta del pedido (RF-50): los pasos por los que pasó y, si sigue activo, los que faltan del recorrido
  /// normal. Un desvío (esperando tu decisión, en revisión) aparece donde ocurrió; uno cancelado no muestra pendientes.
  static List<RouteStop> route({required List<TimelineEntry> timeline, required List<String> journey, required bool active}) {
    final stops = <RouteStop>[
      for (var i = 0; i < timeline.length; i++)
        (status: timeline[i].status, state: i == timeline.length - 1 && active ? StopState.current : StopState.done, at: timeline[i].at),
    ];
    if (!active) return stops;
    final reached = timeline.fold(-1, (max, t) {
      final index = journey.indexOf(t.status);
      return index > max ? index : max;
    });
    return [...stops, for (final status in journey.skip(reached + 1)) (status: status, state: StopState.upcoming, at: null)];
  }

  /// Avance del recorrido normal (0 a 1) para la barra de los pedidos activos.
  static double progress(String status, List<String> journey) {
    final index = journey.indexOf(status);
    return index < 0 || journey.length < 2 ? 0 : index / (journey.length - 1);
  }

  /// Billetes con los que podría pagar en efectivo: el siguiente múltiplo de $10.000, $20.000, $50.000 y
  /// $100.000 por encima del total, sin repetir. Así el domiciliario lleva el cambio.
  static List<int> cashSuggestions(int totalCents) {
    final amounts = {
      for (final step in const [1000000, 2000000, 5000000, 10000000]) (totalCents / step).ceil() * step,
    }.where((a) => a > totalCents).toList()
      ..sort();
    return amounts.take(3).toList();
  }
}
