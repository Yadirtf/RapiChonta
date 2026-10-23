import 'package:equatable/equatable.dart';

/// E09: la pregunta del domiciliario desde el local cuando un producto se acabó o cambió de precio. No es un chat:
/// cada línea trae solo sus opciones cerradas y la consulta vence sola. La misma forma para el cliente y el
/// domiciliario (GET /orders/:code y GET /courier/trip). Montos en centavos; motivos y decisiones son códigos.

/// Por qué pregunta: no lo hay, o el local pide otro precio.
abstract final class AdjustmentReasons {
  static const unavailable = 'UNAVAILABLE';
  static const priceChanged = 'PRICE_CHANGED';
}

/// Las opciones cerradas. EXPIRED_REMOVED la toma el sistema cuando se acaba el tiempo.
abstract final class AdjustmentDecisions {
  static const substitute = 'SUBSTITUTE';
  static const removeItem = 'REMOVE_ITEM';
  static const acceptPrice = 'ACCEPT_PRICE';
  static const cancelOrder = 'CANCEL_ORDER';
  static const expiredRemoved = 'EXPIRED_REMOVED';
}

class AdjustmentLine extends Equatable {
  const AdjustmentLine({
    required this.id,
    required this.orderItemId,
    required this.name,
    required this.quantity,
    required this.unitCents,
    required this.reason,
    this.reportedUnitCents,
    this.decision,
    this.decidedAt,
    this.substitute,
    this.options = const [],
  });

  final String id;
  final String orderItemId;
  final String name;
  final int quantity;

  /// Precio por unidad cuando se consultó.
  final int unitCents;
  final String reason;

  /// Con PRICE_CHANGED: lo que pide ahora el local por unidad.
  final int? reportedUnitCents;
  final String? decision;
  final DateTime? decidedAt;

  /// La línea que la reemplazó ("cambiar por").
  final ({String name, int quantity, int unitCents})? substitute;

  /// Lo que puede elegir el cliente, en orden (vacío si ya decidió).
  final List<String> options;

  bool get pending => decision == null;

  @override
  List<Object?> get props => [id, decision, substitute, options];
}

class OrderAdjustment extends Equatable {
  const OrderAdjustment({required this.id, required this.reportedAt, required this.expiresAt, required this.open, required this.lines});

  final String id;
  final DateTime reportedAt;
  final DateTime expiresAt;

  /// Le falta alguna decisión: es la pregunta que el cliente tiene en pantalla.
  final bool open;
  final List<AdjustmentLine> lines;

  Iterable<AdjustmentLine> get pending => lines.where((l) => l.pending);

  /// Lo que dura la consulta completa (para la mecha).
  Duration get span => expiresAt.difference(reportedAt);

  @override
  List<Object?> get props => [id, open, expiresAt, lines];
}

/// Un producto del mismo local para "Cambiar por".
class SubstituteOption extends Equatable {
  const SubstituteOption({required this.productId, required this.productVersionId, required this.name, required this.priceCents, required this.sameSection, this.imageUrl});

  final String productId;

  /// La versión que vio el cliente: es la que se compra.
  final String productVersionId;
  final String name;
  final int priceCents;
  final String? imageUrl;

  /// De la misma sección del menú que el que falta.
  final bool sameSection;

  @override
  List<Object?> get props => [productVersionId, priceCents];
}

/// Lo que marca el domiciliario en el local: la línea, por qué y (si cambió) el precio nuevo por unidad en pesos.
class ReportedLine extends Equatable {
  const ReportedLine({required this.orderItemId, required this.reason, this.unitPesos});

  final String orderItemId;
  final String reason;
  final int? unitPesos;

  Map<String, dynamic> toJson() => {'orderItemId': orderItemId, 'reason': reason, if (unitPesos != null) 'unitPrice': '$unitPesos'};

  @override
  List<Object?> get props => [orderItemId, reason, unitPesos];
}

/// Reglas de E09 para la vista, puras para poder probarlas.
abstract final class AdjustmentRules {
  /// Las mismas que la API: una consulta cubre hasta 30 líneas.
  static const maxReportedLines = 30;

  /// La consulta que espera respuesta, o null.
  static OrderAdjustment? openOf(List<OrderAdjustment> adjustments) => adjustments.where((a) => a.open).firstOrNull;

  /// Cuánto cambia el total de productos con una decisión, en centavos (negativo: baja). Cambiar por otro se
  /// calcula con el precio elegido; cancelar no tiene diferencia (el pedido no sigue).
  static int? deltaCents(AdjustmentLine line, String decision, {int? substituteCents}) {
    final current = line.unitCents * line.quantity;
    return switch (decision) {
      AdjustmentDecisions.removeItem || AdjustmentDecisions.expiredRemoved => -current,
      AdjustmentDecisions.acceptPrice when line.reportedUnitCents != null => line.reportedUnitCents! * line.quantity - current,
      AdjustmentDecisions.substitute when substituteCents != null => substituteCents * line.quantity - current,
      _ => null,
    };
  }

  /// Lo que cambió por las preguntas ya respondidas (para el recibo). Cancelar no cuenta: el pedido terminó.
  static List<AdjustmentLine> changes(List<OrderAdjustment> adjustments) => [
        for (final a in adjustments.where((a) => !a.open))
          for (final l in a.lines)
            if (l.decision != null && l.decision != AdjustmentDecisions.cancelOrder) l,
      ];

  /// Por qué no se puede enviar lo marcado (la API revisa lo mismo), o null si está bien: sin líneas, demasiadas,
  /// sin precio nuevo o con el mismo precio de antes.
  static String? reportProblem(List<ReportedLine> lines, Map<String, int> unitCentsByItem) {
    if (lines.isEmpty) return 'EMPTY';
    if (lines.length > maxReportedLines) return 'TOO_MANY';
    for (final line in lines) {
      if (line.reason != AdjustmentReasons.priceChanged) continue;
      final pesos = line.unitPesos;
      if (pesos == null || pesos <= 0) return 'PRICE_REQUIRED';
      if (pesos * 100 == unitCentsByItem[line.orderItemId]) return 'PRICE_UNCHANGED';
    }
    return null;
  }
}
