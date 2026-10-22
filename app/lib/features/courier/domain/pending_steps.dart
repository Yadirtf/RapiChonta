import 'package:equatable/equatable.dart';

import '../../../core/error/failure.dart';

/// H08.8: los pasos del pedido que el domiciliario marcó sin señal. Se guardan en el teléfono con la hora en
/// que ocurrieron y su id de evento; al volver la señal salen en orden y la API no repite uno ya aplicado.

enum StepKind {
  /// Total pagado + factura: AT_ESTABLISHMENT → PREPARING.
  purchase,

  /// "Ya está listo": PREPARING → ON_THE_WAY.
  ready,

  /// "Sigue en preparación": se queda en PREPARING.
  delay,

  /// "Llegué": ON_THE_WAY → ARRIVING.
  arrived,

  /// Entrega con foto (sin código): ARRIVING → PENDING_REVIEW. La foto espera en el teléfono como la factura.
  proof,
}

class PendingStep extends Equatable {
  const PendingStep({
    required this.id,
    required this.orderCode,
    required this.kind,
    required this.occurredAt,
    this.amount,
    this.receiptPath,
    this.receiptMime,
    this.receiptFileId,
  });

  /// clientEventId (UUID v4).
  final String id;
  final String orderCode;
  final StepKind kind;
  final DateTime occurredAt;

  /// Pesos en texto decimal ("38500"), solo en la compra.
  final String? amount;

  /// La foto (factura o entrega) guardada en el teléfono hasta que se suba.
  final String? receiptPath;
  final String? receiptMime;

  /// Ya subida: no se vuelve a subir al reintentar.
  final String? receiptFileId;

  PendingStep withReceipt(String fileId) => PendingStep(
        id: id,
        orderCode: orderCode,
        kind: kind,
        occurredAt: occurredAt,
        amount: amount,
        receiptPath: receiptPath,
        receiptMime: receiptMime,
        receiptFileId: fileId,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'orderCode': orderCode,
        'kind': kind.name,
        'occurredAt': occurredAt.toUtc().toIso8601String(),
        'amount': ?amount,
        'receiptPath': ?receiptPath,
        'receiptMime': ?receiptMime,
        'receiptFileId': ?receiptFileId,
      };

  /// Una entrada dañada o de otra versión se descarta (null) en vez de bloquear la cola.
  static PendingStep? tryParse(Object? json) {
    if (json is! Map) return null;
    final kind = StepKind.values.where((k) => k.name == json['kind']).firstOrNull;
    final occurredAt = DateTime.tryParse(json['occurredAt']?.toString() ?? '');
    final id = json['id'], code = json['orderCode'];
    if (kind == null || occurredAt == null || id is! String || code is! String) return null;
    final hasPhoto = json['receiptPath'] is String || json['receiptFileId'] is String;
    if (kind == StepKind.purchase && (json['amount'] is! String || !hasPhoto)) return null;
    if (kind == StepKind.proof && !hasPhoto) return null;
    return PendingStep(
      id: id,
      orderCode: code,
      kind: kind,
      occurredAt: occurredAt,
      amount: json['amount'] as String?,
      receiptPath: json['receiptPath'] as String?,
      receiptMime: json['receiptMime'] as String?,
      receiptFileId: json['receiptFileId'] as String?,
    );
  }

  @override
  List<Object?> get props => [id, receiptFileId];
}

/// Reglas puras de la cola, para la vista y las pruebas.
abstract final class PendingRules {
  /// Fallas tras las que vale la pena reintentar: no hubo respuesta o el servidor no pudo. Cualquier otra
  /// (el paso ya no aplica, la factura no sirve) se le muestra al domiciliario y el paso sale de la cola.
  static bool retryable(Object error) {
    if (error is! Failure) return true;
    return const {'NETWORK_ERROR', 'SERVER_ERROR', 'INTERNAL_ERROR', 'TOO_MANY_REQUESTS', 'REQUEST_FAILED'}.contains(error.code);
  }

  /// Lo que el domiciliario ve mientras la cola no ha salido: el estado del servidor más sus pasos pendientes.
  static String effectiveStatus(String serverStatus, Iterable<PendingStep> pending) {
    var status = serverStatus;
    for (final step in pending) {
      status = switch ((status, step.kind)) {
        ('AT_ESTABLISHMENT', StepKind.purchase) => 'PREPARING',
        ('PREPARING', StepKind.ready) => 'ON_THE_WAY',
        ('ON_THE_WAY', StepKind.arrived) => 'ARRIVING',
        ('ARRIVING', StepKind.proof) => 'PENDING_REVIEW',
        _ => status,
      };
    }
    return status;
  }

  /// Ya hay un paso igual esperando (doble toque sin señal): no se encola otro.
  static bool duplicate(Iterable<PendingStep> pending, String orderCode, StepKind kind) =>
      kind != StepKind.delay && pending.any((p) => p.orderCode == orderCode && p.kind == kind);
}
