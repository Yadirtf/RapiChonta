import 'package:equatable/equatable.dart';

import '../../establishments/domain/entities/establishment.dart' show parsePriceCents;

/// H11.4: la caja del día del domiciliario. Los montos con signo miran desde lo que él debe: positivo lo aumenta
/// (la base, lo cobrado), negativo lo baja (lo que pagó en los locales, lo que ya entregó).
class CourierCashDay extends Equatable {
  const CourierCashDay({
    required this.date,
    required this.today,
    required this.fundingMode,
    required this.requiresOpening,
    required this.canReceiveOffers,
    required this.box,
  });

  /// El día pedido y el de hoy en el municipio (AAAA-MM-DD).
  final String date;
  final String today;

  /// CASH_BOX (con base de RapiChonta) u OWN_FUNDS (con su plata); nulo si aún no tiene modo.
  final String? fundingMode;
  final bool requiresOpening;

  /// Hoy: si su modo pide base, ya la recibió y la caja sigue abierta. Sin esto no le llegan ofertas.
  final bool canReceiveOffers;
  final CashBox? box;

  bool get isToday => date == today;

  /// Trabaja con base y hoy aún no se la entregaron.
  bool get awaitingBase => isToday && requiresOpening && !canReceiveOffers && box?.closed != true;

  @override
  List<Object?> get props => [date, today, fundingMode, requiresOpening, canReceiveOffers, box];
}

class CashBox extends Equatable {
  const CashBox({
    required this.id,
    required this.businessDate,
    required this.fundingMode,
    required this.closure,
    required this.totals,
    required this.balance,
    required this.movements,
    required this.orders,
    required this.uncollected,
  });

  final String id;
  final String businessDate;
  final String? fundingMode;
  final CashClosure? closure;
  final List<CashTotal> totals;
  final CashBalance balance;

  /// En el orden del día, del primero al último.
  final List<CashMovement> movements;
  final List<CashOrder> orders;
  final List<CashUncollected> uncollected;

  bool get closed => closure != null;

  /// El total con signo de un tipo de movimiento (0 si no hubo).
  int signedOf(String type) => totals.where((t) => t.type == type).fold(0, (sum, t) => sum + t.signedCents);

  @override
  List<Object?> get props => [id, closure, balance, movements.length];
}

class CashClosure extends Equatable {
  const CashClosure({required this.closedAt, required this.closedBy, required this.notes});

  final DateTime closedAt;
  final String closedBy;
  final String? notes;

  @override
  List<Object?> get props => [closedAt, notes];
}

class CashTotal extends Equatable {
  const CashTotal({required this.type, required this.signedCents, required this.count});

  final String type;
  final int signedCents;
  final int count;

  @override
  List<Object?> get props => [type, signedCents, count];
}

/// `amountDue = movementsNet − courierFees + commissions`: lo calcula la API y coincide con el de la base.
class CashBalance extends Equatable {
  const CashBalance({required this.movementsNetCents, required this.courierFeesCents, required this.commissionsCents, required this.amountDueCents, required this.settledOrders});

  final int movementsNetCents;
  final int courierFeesCents;
  final int commissionsCents;

  /// Positivo: lo entrega a RapiChonta. Negativo: RapiChonta se lo debe a él.
  final int amountDueCents;
  final int settledOrders;

  @override
  List<Object?> get props => [movementsNetCents, courierFeesCents, commissionsCents, amountDueCents, settledOrders];
}

class CashMovement extends Equatable {
  const CashMovement({
    required this.id,
    required this.type,
    required this.signedCents,
    required this.paymentMethod,
    required this.orderCode,
    required this.note,
    required this.createdAt,
    required this.reversed,
    required this.reverses,
  });

  final String id;
  final String type;
  final int signedCents;
  final String? paymentMethod;
  final String? orderCode;
  final String? note;
  final DateTime createdAt;

  /// Un ajuste firmado lo anuló.
  final bool reversed;

  /// Es el ajuste que anula otro movimiento.
  final bool reverses;

  @override
  List<Object?> get props => [id];
}

class CashOrder extends Equatable {
  const CashOrder({required this.code, required this.storeName, required this.feeCents, required this.commissionCents, required this.counted});

  final String code;
  final String storeName;
  final int feeCents;
  final int commissionCents;

  /// Cancelado después del cobro: no deja tarifa ni comisión.
  final bool counted;

  @override
  List<Object?> get props => [code, counted];
}

class CashUncollected extends Equatable {
  const CashUncollected({required this.code, required this.storeName, required this.customerTotalCents});

  final String code;
  final String storeName;
  final int customerTotalCents;

  @override
  List<Object?> get props => [code];
}

/// "-1500.00" → -150000. La API manda montos con signo en texto decimal (RNF-05); nunca en coma flotante.
int parseSignedCents(Object? decimal) {
  final text = decimal?.toString().trim() ?? '';
  final negative = text.startsWith('-');
  final cents = parsePriceCents(negative ? text.substring(1) : text) ?? 0;
  return negative ? -cents : cents;
}
