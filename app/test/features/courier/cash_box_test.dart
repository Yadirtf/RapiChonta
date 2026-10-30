import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/courier/data/courier_repository_impl.dart';
import 'package:rapichonta/features/courier/domain/cash_box.dart';

/// Una caja con base: 20.000 de base, 18.000 en el local, 41.500 cobrados, tarifa 3.000 y comisión 500.
Map<String, dynamic> cashDayJson({bool closed = false, bool canReceiveOffers = true}) => {
      'date': '2026-10-30',
      'today': '2026-10-30',
      'fundingMode': 'CASH_BOX',
      'requiresOpening': true,
      'canReceiveOffers': canReceiveOffers,
      'box': {
        'id': 'caja-1',
        'businessDate': '2026-10-30',
        'courier': {'userId': 'u1', 'givenNames': 'Wilmer', 'familyNames': 'Jansasoy'},
        'fundingMode': 'CASH_BOX',
        'state': closed ? 'CLOSED' : 'OPEN',
        'closure': closed
            ? {'closedAt': '2026-10-31T02:10:00.000Z', 'closedBy': {'givenNames': 'Luz', 'familyNames': 'Jamioy'}, 'notes': null}
            : null,
        'totals': [
          {'type': 'OPENING', 'direction': 1, 'total': '20000.00', 'signed': '20000.00', 'count': 1},
          {'type': 'PURCHASE', 'direction': -1, 'total': '18000.00', 'signed': '-18000.00', 'count': 1},
          {'type': 'COLLECTION', 'direction': 1, 'total': '41500.00', 'signed': '41500.00', 'count': 1},
        ],
        'balance': {'movementsNet': '43500.00', 'courierFees': '3000.00', 'commissions': '500.00', 'amountDue': '41000.00', 'settledOrders': 1},
        'movements': [
          {'id': 'm1', 'type': 'OPENING', 'direction': 1, 'amount': '20000.00', 'signed': '20000.00', 'paymentMethod': 'CASH', 'orderCode': null, 'note': null, 'createdAt': '2026-10-30T12:00:00.000Z', 'createdBy': null, 'reversesMovementId': null, 'reversedById': null, 'isCorrection': false, 'reversible': true},
          {'id': 'm2', 'type': 'PURCHASE', 'direction': -1, 'amount': '18000.00', 'signed': '-18000.00', 'paymentMethod': null, 'orderCode': 'RC-7K3M', 'note': null, 'createdAt': '2026-10-30T13:00:00.000Z', 'createdBy': null, 'reversesMovementId': null, 'reversedById': null, 'isCorrection': false, 'reversible': true},
          {'id': 'm3', 'type': 'COLLECTION', 'direction': 1, 'amount': '41500.00', 'signed': '41500.00', 'paymentMethod': 'NEQUI', 'orderCode': 'RC-7K3M', 'note': null, 'createdAt': '2026-10-30T13:30:00.000Z', 'createdBy': null, 'reversesMovementId': null, 'reversedById': null, 'isCorrection': false, 'reversible': true},
        ],
        'orders': [
          {'code': 'RC-7K3M', 'storeName': 'Asadero El Chontaduro', 'status': 'DELIVERED', 'customerTotal': '41500.00', 'collected': '41500.00', 'deliveryFee': '3000.00', 'commission': '500.00', 'counted': true},
        ],
        'uncollected': [],
      },
    };

void main() {
  test('los montos con signo llegan en centavos exactos, sin coma flotante', () {
    expect(parseSignedCents('-1500.5'), -150050);
    expect(parseSignedCents('41000.00'), 4100000);
    expect(parseSignedCents('0.00'), 0);
    expect(parseSignedCents(null), 0);
  });

  test('la caja del día: el desglose y lo que debe entregar', () {
    final day = cashDayFromJson(cashDayJson());
    final box = day.box!;
    expect(day.isToday, isTrue);
    expect(day.awaitingBase, isFalse);
    expect(box.closed, isFalse);
    expect(box.signedOf('PURCHASE'), -1800000);
    expect(box.signedOf('RETURN'), 0);
    // El saldo que trae la API es el de sus partes: neto del libro − tarifas + comisión.
    final b = box.balance;
    expect(b.movementsNetCents - b.courierFeesCents + b.commissionsCents, b.amountDueCents);
    expect(b.amountDueCents, 4100000);
    expect(box.movements.map((m) => m.signedCents), [2000000, -1800000, 4150000]);
  });

  test('con base y sin entregar: no le llegan pedidos hasta que la oficina la dé', () {
    final day = cashDayFromJson({...cashDayJson(), 'canReceiveOffers': false, 'box': null});
    expect(day.awaitingBase, isTrue);
    final closed = cashDayFromJson(cashDayJson(closed: true, canReceiveOffers: false));
    expect(closed.awaitingBase, isFalse);
    expect(closed.box!.closure!.closedBy, 'Luz Jamioy');
  });
}
