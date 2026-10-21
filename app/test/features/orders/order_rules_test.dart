import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/establishments/domain/entities/establishment.dart';
import 'package:rapichonta/features/orders/data/order_repository_impl.dart';
import 'package:rapichonta/features/orders/domain/entities/order.dart';
import 'package:rapichonta/features/orders/presentation/checkout_draft.dart';

const journey = ['PENDING_ASSIGNMENT', 'ACCEPTED', 'AT_ESTABLISHMENT', 'PREPARING', 'ON_THE_WAY', 'ARRIVING', 'DELIVERED'];
final t0 = DateTime.utc(2026, 10, 21, 15);

void main() {
  group('OrderRules.route', () {
    test('un pedido activo muestra lo recorrido y los hitos que faltan', () {
      final stops = OrderRules.route(
        timeline: [TimelineEntry('PENDING_ASSIGNMENT', t0), TimelineEntry('ACCEPTED', t0.add(const Duration(minutes: 3)))],
        journey: journey,
        active: true,
      );
      expect(stops.map((s) => s.status), journey);
      expect(stops[0].state, StopState.done);
      expect(stops[1].state, StopState.current);
      expect(stops.skip(2).every((s) => s.state == StopState.upcoming && s.at == null), isTrue);
    });

    test('un desvío aparece donde ocurrió y el recorrido sigue desde el último hito', () {
      final stops = OrderRules.route(
        timeline: [TimelineEntry('PENDING_ASSIGNMENT', t0), TimelineEntry('AT_ESTABLISHMENT', t0), TimelineEntry('AWAITING_CUSTOMER', t0)],
        journey: journey,
        active: true,
      );
      expect(stops.map((s) => s.status).take(4), ['PENDING_ASSIGNMENT', 'AT_ESTABLISHMENT', 'AWAITING_CUSTOMER', 'PREPARING']);
      expect(stops[2].state, StopState.current);
    });

    test('un pedido cancelado no muestra pasos pendientes', () {
      final stops = OrderRules.route(timeline: [TimelineEntry('PENDING_ASSIGNMENT', t0), TimelineEntry('CANCELLED', t0)], journey: journey, active: false);
      expect(stops.map((s) => s.state), [StopState.done, StopState.done]);
    });
  });

  test('el avance va de 0 a 1 por los hitos', () {
    expect(OrderRules.progress('PENDING_ASSIGNMENT', journey), 0);
    expect(OrderRules.progress('DELIVERED', journey), 1);
    expect(OrderRules.progress('AWAITING_CUSTOMER', journey), 0);
  });

  test('los billetes sugeridos están por encima del total y no se repiten', () {
    expect(OrderRules.cashSuggestions(2300000), [3000000, 4000000, 5000000]);
    expect(OrderRules.cashSuggestions(5000000), [6000000, 10000000]);
  });

  group('CheckoutDraft', () {
    test('arranca en el lugar predeterminado; sin lugares, el punto se guarda como Casa', () {
      const home = SavedAddress(id: 'a', label: 'Casa', location: GeoPoint(1, -76));
      const work = SavedAddress(id: 'b', label: 'Trabajo', location: GeoPoint(1, -76), isDefault: true);
      expect(CheckoutDraft.start([home, work]).savedAddressId, 'b');
      expect(CheckoutDraft.start(const []).saveAs, PlaceLabel.home);
    });

    test('un punto nuevo exige referencia, y otra persona exige nombre y celular', () {
      var draft = CheckoutDraft.start(const []).copyWith(point: const GeoPoint(1.03, -76.61), recipientMode: RecipientMode.other);
      expect(draft.problems, [DraftProblem.reference, DraftProblem.recipient, DraftProblem.payment]);
      draft = draft.copyWith(reference: 'Portón verde', recipientName: 'Rosa', recipientPhone: '312 456 7890', payment: 'CASH');
      expect(draft.problems, isEmpty);
      expect(draft.recipient!.toJson(), {'fullName': 'Rosa', 'phone': '+573124567890'});
    });

    test('el punto se envía con su nombre para guardarlo y la nota lleva el billete', () {
      final draft = CheckoutDraft.start(const []).copyWith(
        point: const GeoPoint(1.0294123456, -76.6165),
        reference: ' Casa azul ',
        payment: 'CASH',
        cashWith: () => const Bill(5000000),
        notes: 'Timbre dañado',
      );
      expect(draft.deliveryTarget((l) => l.name).toJson(), {'latitude': 1.0294123, 'longitude': -76.6165, 'reference': 'Casa azul', 'label': 'home'});
      expect(draft.courierNotes((c) => c is Bill ? 'Pago con ${c.cents ~/ 100}' : 'Exacto'), 'Pago con 50000\nTimbre dañado');
    });
  });

  test('el detalle de la API se lee en centavos', () {
    final order = detailFromJson({
      'code': 'RC-7K3M',
      'establishment': {'id': 'e', 'name': 'Burger', 'logoUrl': null},
      'createdAt': '2026-10-21T15:00:00.000Z',
      'status': 'PENDING_ASSIGNMENT',
      'statusAt': '2026-10-21T15:00:00.000Z',
      'active': true,
      'itemCount': 2,
      'total': '23000.00',
      'lines': [
        {'productId': 'p', 'name': 'Hamburguesa', 'unitPrice': '10000.00', 'quantity': 2, 'notes': 'Sin cebolla', 'subtotal': '20000.00'},
      ],
      'itemsTotal': '20000.00',
      'deliveryFee': '3000.00',
      'prepMinutes': 15,
      'zone': {'name': 'Centro', 'kind': 'URBAN'},
      'address': {'label': 'Casa', 'line': null, 'reference': 'Casa azul', 'latitude': 1.03, 'longitude': -76.61},
      'recipient': null,
      'paymentMethod': 'CASH',
      'notes': null,
      'timeline': [
        {'status': 'PENDING_ASSIGNMENT', 'at': '2026-10-21T15:00:00.000Z'},
      ],
      'journey': journey,
    });
    expect(order.totalCents, 2300000);
    expect(order.lines.single.subtotalCents, 2000000);
    expect(order.address.location, const GeoPoint(1.03, -76.61));
    expect(order.journey.length, 7);
  });
}
