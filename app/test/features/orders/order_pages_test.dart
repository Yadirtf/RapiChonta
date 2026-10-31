import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/core/error/failure.dart';
import 'package:rapichonta/features/establishments/domain/entities/cart.dart';
import 'package:rapichonta/features/establishments/domain/entities/establishment.dart';
import 'package:rapichonta/features/establishments/presentation/providers/establishments_providers.dart';
import 'package:rapichonta/features/orders/domain/entities/adjustment.dart';
import 'package:rapichonta/features/orders/domain/entities/order.dart';
import 'package:rapichonta/features/orders/domain/repositories/order_repository.dart';
import 'package:rapichonta/features/orders/presentation/pages/checkout_page.dart';
import 'package:rapichonta/features/orders/presentation/pages/my_orders_page.dart';
import 'package:rapichonta/features/orders/presentation/pages/order_detail_page.dart';
import 'package:rapichonta/features/orders/presentation/providers/orders_providers.dart';
import 'package:rapichonta/l10n/app_localizations.dart';

const _journey = ['PENDING_ASSIGNMENT', 'ACCEPTED', 'AT_ESTABLISHMENT', 'PREPARING', 'ON_THE_WAY', 'ARRIVING', 'DELIVERED'];
final _at = DateTime.utc(2026, 10, 21, 20, 7);

final _delivered = OrderDetail(
  code: 'RC-W9W5',
  establishmentId: 'e1',
  establishmentName: 'Burger Demo',
  createdAt: _at,
  status: 'DELIVERED',
  statusAt: _at,
  active: false,
  itemCount: 2,
  totalCents: 2300000,
  lines: const [OrderLine(productId: 'p1', name: 'Hamburguesa sencilla', unitCents: 1400000, quantity: 1, notes: 'Sin cebolla')],
  itemsCents: 2000000,
  feeCents: 300000,
  prepMinutes: 15,
  zoneName: 'Centro',
  address: const SavedAddress(id: '', label: 'Trabajo', reference: 'Portón verde', location: GeoPoint(1.03, -76.61)),
  recipient: (fullName: 'Rosa Mutumbajoy', phone: '+573124567890'),
  paymentMethod: 'CASH',
  notes: r'Pago con $ 30.000',
  timeline: [TimelineEntry('PENDING_ASSIGNMENT', _at), TimelineEntry('DELIVERED', _at.add(const Duration(minutes: 40)))],
  journey: _journey,
);

/// Preparándose con retraso (E08): el domiciliario ya pagó y avisó que el local sigue preparando.
final _delayed = OrderDetail(
  code: 'RC-7K3M',
  establishmentId: 'e1',
  establishmentName: 'Burger Demo',
  createdAt: _at,
  status: 'PREPARING',
  statusAt: _at,
  active: true,
  itemCount: 1,
  totalCents: 1700000,
  lines: const [OrderLine(productId: 'p1', name: 'Hamburguesa sencilla', unitCents: 1400000, quantity: 1)],
  itemsCents: 1400000,
  feeCents: 300000,
  prepMinutes: 15,
  zoneName: 'Centro',
  address: const SavedAddress(id: '', label: 'Casa', location: GeoPoint(1.03, -76.61)),
  paymentMethod: 'CASH',
  timeline: [TimelineEntry('PENDING_ASSIGNMENT', _at), TimelineEntry('PREPARING', _at)],
  journey: _journey,
  preparation: (estimatedReadyAt: DateTime.utc(2026, 10, 21, 20, 45), delayed: true),
  purchase: (amountCents: 1450000, receiptUrl: 'https://archivos.example/factura.jpg'),
);

/// En camino (E10): el cliente ve su código de entrega; recibe otra persona.
final _onTheWay = OrderDetail(
  code: 'RC-7K3M',
  establishmentId: 'e1',
  establishmentName: 'Burger Demo',
  createdAt: _at,
  status: 'ARRIVING',
  statusAt: _at,
  active: true,
  itemCount: 1,
  totalCents: 1700000,
  lines: const [OrderLine(productId: 'p1', name: 'Hamburguesa sencilla', unitCents: 1400000, quantity: 1)],
  itemsCents: 1400000,
  feeCents: 300000,
  prepMinutes: 15,
  zoneName: 'Centro',
  address: const SavedAddress(id: '', label: 'Casa', location: GeoPoint(1.03, -76.61)),
  recipient: (fullName: 'Rosa Mutumbajoy', phone: '+573124567890'),
  paymentMethod: 'CASH',
  timeline: [TimelineEntry('PENDING_ASSIGNMENT', _at), TimelineEntry('ARRIVING', _at)],
  journey: _journey,
  delivery: const OrderDelivery(code: '0427'),
);

/// Entregado con foto: el cliente confirma o reclama antes del cierre automático.
final _leftWithPhoto = OrderDetail(
  code: 'RC-7K3M',
  establishmentId: 'e1',
  establishmentName: 'Burger Demo',
  createdAt: _at,
  status: 'PENDING_REVIEW',
  statusAt: _at,
  active: true,
  itemCount: 1,
  totalCents: 1700000,
  lines: const [OrderLine(productId: 'p1', name: 'Hamburguesa sencilla', unitCents: 1400000, quantity: 1)],
  itemsCents: 1400000,
  feeCents: 300000,
  prepMinutes: 15,
  zoneName: 'Centro',
  address: const SavedAddress(id: '', label: 'Casa', location: GeoPoint(1.03, -76.61)),
  paymentMethod: 'CASH',
  timeline: [TimelineEntry('PENDING_ASSIGNMENT', _at), TimelineEntry('PENDING_REVIEW', _at)],
  journey: _journey,
  delivery: OrderDelivery(reviewClosesAt: DateTime.utc(2026, 10, 21, 22, 7)),
);

/// E09: el domiciliario pregunta desde el local. La gaseosa se acabó y la hamburguesa subió de precio.
OrderDetail _awaiting({required DateTime expiresAt}) => OrderDetail(
      code: 'RC-7K3M',
      establishmentId: 'e1',
      establishmentName: 'Burger Demo',
      createdAt: _at,
      status: 'AWAITING_CUSTOMER',
      statusAt: _at,
      active: true,
      itemCount: 3,
      totalCents: 2300000,
      lines: const [
        OrderLine(productId: 'p1', name: 'Hamburguesa sencilla', unitCents: 1400000, quantity: 1),
        OrderLine(productId: 'p2', name: 'Gaseosa', unitCents: 300000, quantity: 2),
      ],
      itemsCents: 2000000,
      feeCents: 300000,
      prepMinutes: 15,
      zoneName: 'Centro',
      address: const SavedAddress(id: '', label: 'Casa', location: GeoPoint(1.03, -76.61)),
      paymentMethod: 'CASH',
      timeline: [TimelineEntry('PENDING_ASSIGNMENT', _at), TimelineEntry('AT_ESTABLISHMENT', _at), TimelineEntry('AWAITING_CUSTOMER', _at)],
      journey: _journey,
      adjustments: [
        OrderAdjustment(id: 'req-1', reportedAt: expiresAt.subtract(const Duration(minutes: 3)), expiresAt: expiresAt, open: true, lines: const [
          AdjustmentLine(id: 'adj-gaseosa', orderItemId: 'i2', name: 'Gaseosa', quantity: 2, unitCents: 300000, reason: 'UNAVAILABLE', options: ['SUBSTITUTE', 'REMOVE_ITEM', 'CANCEL_ORDER']),
          AdjustmentLine(
            id: 'adj-burger',
            orderItemId: 'i1',
            name: 'Hamburguesa sencilla',
            quantity: 1,
            unitCents: 1400000,
            reason: 'PRICE_CHANGED',
            reportedUnitCents: 1600000,
            options: ['ACCEPT_PRICE', 'REMOVE_ITEM', 'CANCEL_ORDER'],
          ),
        ]),
      ],
    );

class _Orders implements OrderRepository {
  _Orders({
    this.missing = false,
    this.detail,
    this.methods = const [PaymentOption('CASH'), PaymentOption('NEQUI'), PaymentOption('DAVIPLATA'), PaymentOption('BANK_TRANSFER')],
    this.modes = const [defaultFulfillmentMode],
  });
  final bool missing;
  final List<String> modes;
  final List<PaymentOption> methods;
  final OrderDetail? detail;
  final closed = <String>[];
  final decisions = <String>[];

  @override
  Future<List<SubstituteOption>> substitutes(String code, String adjustmentId, {required String language}) async => const [
        SubstituteOption(productId: 'p3', productVersionId: 'v-lulo', name: 'Jugo de lulo', priceCents: 350000, sameSection: true),
        SubstituteOption(productId: 'p4', productVersionId: 'v-papas', name: 'Papas a la francesa', priceCents: 600000, sameSection: false),
      ];

  @override
  Future<void> decideAdjustment(String code, String adjustmentId, {required String decision, String? productVersionId}) async =>
      decisions.add([adjustmentId, decision, ?productVersionId].join(' '));

  @override
  Future<void> confirmReceived(String code) async => closed.add('received $code');

  @override
  Future<void> reportNotReceived(String code, {String? description}) async => closed.add(['not-received $code', ?description].join(': '));

  @override
  Future<OrderDetail> find(String code, {required String language}) async => missing ? throw const Failure('', code: 'ORDER_NOT_FOUND') : detail ?? _delivered;

  @override
  Future<OrderHistory> mine({String? before}) async => OrderHistory(active: const [], past: [_delivered], journey: _journey);

  @override
  Future<List<SavedAddress>> addresses() async => const [SavedAddress(id: 'a1', label: 'Casa', reference: 'Casa azul', location: GeoPoint(1.03, -76.61), isDefault: true)];

  @override
  Future<SavedAddress?> lastAddress() async => const SavedAddress(id: 'a1', label: 'Casa', reference: 'Casa azul', location: GeoPoint(1.03, -76.61), isDefault: true);

  @override
  Future<List<SavedRecipient>> recipients() async => const [];

  @override
  Future<List<PaymentOption>> paymentMethods() async => methods;

  @override
  Future<OrderQuote> quote({required String establishmentId, required List<Map<String, dynamic>> items, required DeliveryTarget delivery, required String language}) async =>
      OrderQuote(itemsCents: 2000000, feeCents: 300000, totalCents: 2300000, prepMinutes: 15, zoneName: 'Centro',
          newCustomerLimit: const NewCustomerLimit(limitCents: 10000000, availableCents: 7400000, exceeded: false), fulfillmentModes: modes);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _MemoryCart implements CartStore {
  _MemoryCart(this.saved);
  Cart? saved;

  @override
  Future<Cart?> read() async => saved;

  @override
  Future<void> write(Cart? cart) async => saved = cart;
}

Widget _app(Widget home, {OrderRepository? orders, CartStore? cart, GeoPoint? gps}) => ProviderScope(
      overrides: [
        preciseLocationProvider.overrideWith((ref) async => gps),
        orderRepositoryProvider.overrideWithValue(orders ?? _Orders()),
        cartStoreProvider.overrideWithValue(cart ?? _MemoryCart(null)),
      ],
      child: MaterialApp(
        locale: const Locale('es'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: home,
      ),
    );

/// La ruta late y la mecha corre: no hay "settle", se dejan pasar las animaciones de hojas y diálogos.
Future<void> _sheet(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  setUp(() => TestWidgetsFlutterBinding.ensureInitialized());

  testWidgets('el detalle muestra el código, la ruta, la comanda y a quién se entrega', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2400));
    await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-W9W5')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('RC-W9W5'), findsOneWidget);
    expect(find.text('Entregado'), findsWidgets);
    expect(find.text('Así va tu pedido'), findsOneWidget);
    expect(find.text('Hamburguesa sencilla'), findsOneWidget);
    expect(find.text('Sin cebolla'), findsOneWidget);
    expect(find.text(r'$ 23.000'), findsOneWidget);
    expect(find.text('Rosa Mutumbajoy'), findsOneWidget);
    expect(find.text('+57 312 456 7890'), findsOneWidget);
    // Un pedido entregado no muestra pasos pendientes.
    expect(find.text('En camino'), findsNothing);
  });

  testWidgets('recién confirmado celebra y vacía la canasta de ese local', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2400));
    final store = _MemoryCart(const Cart(establishmentId: 'e1', establishmentName: 'Burger Demo', lines: [
      CartLine(productId: 'p1', versionId: 'v1', name: 'Hamburguesa', priceCents: 1400000, quantity: 1),
    ]));
    await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-W9W5', placed: true), cart: store));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    expect(find.text('¡Recibimos tu pedido!'), findsOneWidget);
    expect(store.saved, isNull);
  });

  testWidgets('con retraso en el local avisa alta demanda y muestra lo que pagó el domiciliario (H08.4, H08.5)', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2600));
    await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-7K3M'), orders: _Orders(detail: _delayed)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Hay alta demanda en Burger Demo'), findsOneWidget);
    expect(find.text('Listo hacia las 3:45 p. m.'), findsOneWidget);
    // H09.1: el fogón de la parada "Preparando", ya cumplido y con retraso avisado.
    expect(find.text('Alta demanda: sigue en preparación'), findsOneWidget);
    expect(find.text(r'Tu domiciliario pagó $ 14.500 en el local.'), findsOneWidget);
    expect(find.text('Ver factura'), findsOneWidget);
  });

  testWidgets('en camino muestra el código de entrega, cómo enviárselo a quien recibe y "Ya lo recibí"', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2600));
    final orders = _Orders(detail: _onTheWay);
    await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-7K3M'), orders: orders));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('TU CÓDIGO DE ENTREGA'), findsOneWidget);
    for (final digit in ['0', '4', '2', '7']) {
      expect(find.text(digit), findsOneWidget);
    }
    expect(find.text('Lo recibe Rosa Mutumbajoy: envíale el código.'), findsOneWidget);
    expect(find.text('Enviar a Rosa Mutumbajoy'), findsOneWidget);

    await tester.tap(find.text('Ya lo recibí'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('¿Ya tienes tu pedido?'), findsOneWidget);
    await tester.tap(find.text('Sí, lo recibí'));
    await tester.pump();
    expect(orders.closed, ['received RC-7K3M']);
  });

  testWidgets('entregado con foto: muestra hasta cuándo puede reclamar y "No lo recibí"', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2600));
    final orders = _Orders(detail: _leftWithPhoto);
    await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-7K3M'), orders: orders));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Tu domiciliario dejó el pedido'), findsOneWidget);
    expect(find.text('Si no nos dices nada, a las 5:07 p. m. lo damos por entregado.'), findsOneWidget);
    await tester.tap(find.text('No lo recibí'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    // Lo que cuenta llega al expediente del caso.
    await tester.enterText(find.byType(TextField), '  Estuve en casa y nadie timbró ');
    await tester.tap(find.text('Sí, no lo recibí'));
    await tester.pump();
    expect(orders.closed, ['not-received RC-7K3M: Estuve en casa y nadie timbró']);
  });

  testWidgets('H10.3: en revisión ve el expediente del caso; cerrado como cancelado, el motivo', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2600));
    OrderDetail disputed({required String status, required OrderIncident incident, String? reason}) => OrderDetail(
          code: 'RC-7K3M',
          establishmentId: 'e1',
          establishmentName: 'Burger Demo',
          createdAt: _at,
          status: status,
          statusAt: _at,
          active: status == 'DISPUTED',
          itemCount: 1,
          totalCents: 1700000,
          lines: const [OrderLine(productId: 'p1', name: 'Hamburguesa sencilla', unitCents: 1400000, quantity: 1)],
          itemsCents: 1400000,
          feeCents: 300000,
          prepMinutes: 15,
          zoneName: 'Centro',
          address: const SavedAddress(id: '', label: 'Casa', location: GeoPoint(1.03, -76.61)),
          paymentMethod: 'CASH',
          timeline: [TimelineEntry('PENDING_REVIEW', _at), TimelineEntry(status, _at)],
          journey: _journey,
          incident: incident,
          cancellationReason: reason,
        );
    await tester.pumpWidget(_app(
      const OrderDetailPage(code: 'RC-7K3M'),
      orders: _Orders(detail: disputed(status: 'DISPUTED', incident: OrderIncident(status: 'IN_REVIEW', reportedAt: _at, reviewStartedAt: _at))),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('CASO RC-7K3M'), findsOneWidget);
    expect(find.text('RapiChonta está revisando tu caso'), findsOneWidget);
    expect(find.text('Alguien del equipo ya lo tiene en sus manos y está hablando con el domiciliario.'), findsOneWidget);

    await tester.pumpWidget(_app(
      const OrderDetailPage(code: 'RC-7K3M'),
      orders: _Orders(
        detail: disputed(
          status: 'CANCELLED',
          incident: OrderIncident(status: 'RESOLVED', reportedAt: _at, reviewStartedAt: _at, resolvedAt: _at, resolution: 'RESOLVED_AS_CANCELLED'),
          reason: 'INCIDENT_RESOLUTION',
        ),
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Cerramos tu caso: cancelamos el pedido'), findsOneWidget);
    expect(find.text('Lo resolvimos al revisar tu caso'), findsOneWidget);
  });

  testWidgets('un código que no es del cliente muestra cómo volver a sus pedidos', (tester) async {
    await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-ZZZZ'), orders: _Orders(missing: true)));
    await tester.pumpAndSettle();
    expect(find.text('No encontramos ese pedido'), findsOneWidget);
  });

  testWidgets('Mis pedidos lista el historial como recibos', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 1200));
    await tester.pumpWidget(_app(const MyOrdersPage()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Pedidos anteriores'), findsOneWidget);
    expect(find.text('Burger Demo'), findsOneWidget);
    expect(find.text(r'$ 23.000'), findsOneWidget);
  });

  testWidgets('sin GPS ofrece la dirección del último pedido, la cotiza y pide elegir el pago antes de confirmar', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 3200));
    final store = _MemoryCart(const Cart(establishmentId: 'e1', establishmentName: 'Burger Demo', lines: [
      CartLine(productId: 'p1', versionId: 'v1', name: 'Hamburguesa sencilla', priceCents: 1400000, quantity: 1),
      CartLine(productId: 'p2', versionId: 'v1', name: 'Papas', priceCents: 600000, quantity: 1),
    ]));
    await tester.pumpWidget(_app(const CheckoutPage(), cart: store));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    expect(find.text('¿Dónde te lo llevamos?'), findsOneWidget);
    expect(find.text(r'Domicilio a Centro: $ 3.000'), findsOneWidget);
    expect(find.text(r'Confirmar pedido · $ 23.000'), findsOneWidget);
    expect(find.text('Tu primer pedido'), findsOneWidget);

    await tester.tap(find.text(r'Confirmar pedido · $ 23.000'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Elige cómo vas a pagar'), findsOneWidget);

    await tester.tap(find.text('Efectivo'));
    await tester.pump();
    expect(find.text('¿Con cuánto pagas?'), findsOneWidget);
    expect(find.text(r'$ 30.000'), findsOneWidget);
  });

  testWidgets('con GPS arranca en el punto donde está el cliente y deja el último pedido al lado, sin elegirlo', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 3200));
    final store = _MemoryCart(const Cart(establishmentId: 'e1', establishmentName: 'Burger Demo', lines: [
      CartLine(productId: 'p1', versionId: 'v1', name: 'Hamburguesa sencilla', priceCents: 1400000, quantity: 1),
    ]));
    await tester.pumpWidget(_app(const CheckoutPage(), cart: store, gps: const GeoPoint(1.0301, -76.6172)));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    expect(find.text('Donde estoy'), findsOneWidget);
    expect(find.text('Según tu GPS'), findsOneWidget);
    expect(find.text('ÚLTIMO PEDIDO'), findsOneWidget);
    expect(find.text('Referencia para encontrarte'), findsOneWidget);
    expect(find.text(r'Domicilio a Centro: $ 3.000'), findsNothing);

    await tester.tap(find.text('ÚLTIMO PEDIDO'));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('Referencia para encontrarte'), findsNothing);
    expect(find.text(r'Domicilio a Centro: $ 3.000'), findsOneWidget);
  });

  testWidgets('el pago muestra solo los medios que deja ver el panel, en su orden y con su imagen', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 3200));
    final store = _MemoryCart(const Cart(establishmentId: 'e1', establishmentName: 'Burger Demo', lines: [
      CartLine(productId: 'p1', versionId: 'v1', name: 'Hamburguesa sencilla', priceCents: 1400000, quantity: 1),
    ]));
    final orders = _Orders(methods: const [PaymentOption('NEQUI', imageUrl: 'https://example.test/nequi.png'), PaymentOption('CASH')]);
    await tester.pumpWidget(_app(const CheckoutPage(), orders: orders, cart: store));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    expect(find.text('Daviplata'), findsNothing);
    expect(find.text('Transferencia'), findsNothing);
    expect(tester.getTopLeft(find.text('Nequi')).dx, lessThan(tester.getTopLeft(find.text('Efectivo')).dx));
    expect(find.byWidgetPredicate((w) => w is Image && w.image is NetworkImage && (w.image as NetworkImage).url == 'https://example.test/nequi.png'), findsOneWidget);
  });

  testWidgets('E15: en un comercio aliado el cliente elige directo o que RapiChonta se lo compre', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 3600));
    final store = _MemoryCart(const Cart(establishmentId: 'e1', establishmentName: 'Burger Demo', lines: [
      CartLine(productId: 'p1', versionId: 'v1', name: 'Hamburguesa sencilla', priceCents: 1400000, quantity: 1),
    ]));
    final orders = _Orders(modes: const [directFulfillmentMode, defaultFulfillmentMode]);
    await tester.pumpWidget(_app(const CheckoutPage(), orders: orders, cart: store));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    expect(find.text('¿Cómo te llega el pedido?'), findsOneWidget);
    expect(find.text('Directo de Burger Demo'), findsOneWidget);
    expect(find.text('ALIADO'), findsOneWidget);
    expect(find.text('RapiChonta te lo compra'), findsOneWidget);
    // Los pasos que siguen corren un número.
    expect(find.text('4'), findsOneWidget);
  });

  testWidgets('E15: el pedido directo cuenta sus hitos a su manera y dice cuándo lo tiene el local', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 3000));
    final detail = OrderDetail(
      code: 'RC-D1R3',
      establishmentId: 'e1',
      establishmentName: 'Burger Demo',
      createdAt: DateTime.utc(2026, 10, 21, 20),
      status: 'PENDING_ASSIGNMENT',
      statusAt: DateTime.utc(2026, 10, 21, 20, 2),
      active: true,
      itemCount: 1,
      totalCents: 1700000,
      fulfillmentMode: directFulfillmentMode,
      merchant: (estimatedReadyAt: DateTime.utc(2026, 10, 21, 20, 20), readyAt: null),
      lines: const [OrderLine(productId: 'p1', name: 'Hamburguesa sencilla', unitCents: 1400000, quantity: 1)],
      itemsCents: 1400000,
      feeCents: 300000,
      prepMinutes: 15,
      zoneName: 'Centro',
      address: const SavedAddress(id: 'a1', label: 'Casa', reference: 'Casa azul', location: GeoPoint(1.03, -76.61), isDefault: true),
      paymentMethod: 'CASH',
      timeline: [
        TimelineEntry('AWAITING_MERCHANT', DateTime.utc(2026, 10, 21, 20)),
        TimelineEntry('PENDING_ASSIGNMENT', DateTime.utc(2026, 10, 21, 20, 2)),
      ],
      journey: const ['AWAITING_MERCHANT', 'PENDING_ASSIGNMENT', 'ACCEPTED', 'AT_ESTABLISHMENT', 'ON_THE_WAY', 'ARRIVING', 'DELIVERED'],
    );
    await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-D1R3'), orders: _Orders(detail: detail)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('El local lo está preparando'), findsWidgets);
    expect(find.text('Esperando al local'), findsOneWidget);
    expect(find.text('Recogiendo en el local'), findsOneWidget);
    expect(find.text('Preparando'), findsNothing);
    expect(find.textContaining('Burger Demo lo tiene listo hacia las'), findsOneWidget);
  });

  group('E09: la pregunta del domiciliario', () {
    testWidgets('cada producto trae solo sus opciones, con lo que cambia el total, y la mecha con el tiempo', (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 3000));
      final orders = _Orders(detail: _awaiting(expiresAt: DateTime.now().add(const Duration(minutes: 2, seconds: 30))));
      await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-7K3M'), orders: orders));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('PREGUNTA DE TU DOMICILIARIO'), findsOneWidget);
      expect(find.text('En Burger Demo hay 2 cambios en tu pedido'), findsOneWidget);
      expect(find.textContaining(RegExp(r'^2:(2|3)\d$')), findsOneWidget);
      expect(find.text('Se acabó en el local'), findsOneWidget);
      expect(find.text(r'$ 16.000 c/u'), findsOneWidget);
      expect(find.text(r'+$ 2.000'), findsOneWidget);
      expect(find.text(r'−$ 6.000'), findsOneWidget);

      await tester.tap(find.text('Pagar el nuevo precio'));
      await tester.pump();
      expect(orders.decisions, ['adj-burger ACCEPT_PRICE']);

      await tester.tap(find.text('Cambiar por otro'));
      await _sheet(tester);
      expect(find.text('Cambia Gaseosa por…'), findsOneWidget);
      expect(find.text('Llevamos 2 del que elijas, al precio del menú.'), findsOneWidget);
      expect(find.text('PARECIDOS'), findsOneWidget);
      expect(find.text('MÁS DEL LOCAL'), findsOneWidget);
      expect(find.text(r'+$ 1.000'), findsOneWidget);
      await tester.tap(find.text('Jugo de lulo'));
      await _sheet(tester);
      expect(orders.decisions.last, 'adj-gaseosa SUBSTITUTE v-lulo');

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('cancelar todo pide confirmación y responde por toda la pregunta', (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 3000));
      final orders = _Orders(detail: _awaiting(expiresAt: DateTime.now().add(const Duration(minutes: 2))));
      await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-7K3M'), orders: orders));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      await tester.tap(find.text('Cancelar todo el pedido'));
      await _sheet(tester);
      expect(find.text('El domiciliario no compra nada en Burger Demo y el pedido termina aquí. No se te cobra nada.'), findsOneWidget);
      await tester.tap(find.text('Sí, cancelar'));
      await _sheet(tester);
      expect(orders.decisions, ['adj-gaseosa CANCEL_ORDER']);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('con el tiempo cumplido no deja elegir y dice qué pasa con lo pendiente', (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 3000));
      final orders = _Orders(detail: _awaiting(expiresAt: DateTime.now().subtract(const Duration(seconds: 1))));
      await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-7K3M'), orders: orders));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('0:00'), findsOneWidget);
      expect(find.text('Se acabó el tiempo: estamos quitando lo pendiente para seguir con la compra.'), findsOneWidget);
      expect(find.text('Cancelar todo el pedido'), findsNothing);
      await tester.tap(find.text('Quitarlo').first);
      await tester.pump();
      expect(orders.decisions, isEmpty);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('el recibo cuenta lo que cambió por las preguntas ya respondidas', (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 2600));
      final detail = OrderDetail(
        code: 'RC-W9W5',
        establishmentId: 'e1',
        establishmentName: 'Burger Demo',
        createdAt: _at,
        status: 'DELIVERED',
        statusAt: _at,
        active: false,
        itemCount: 2,
        totalCents: 2400000,
        lines: const [OrderLine(productId: 'p1', name: 'Hamburguesa sencilla', unitCents: 1600000, quantity: 1)],
        itemsCents: 2100000,
        feeCents: 300000,
        prepMinutes: 15,
        zoneName: 'Centro',
        address: const SavedAddress(id: '', label: 'Casa', location: GeoPoint(1.03, -76.61)),
        paymentMethod: 'CASH',
        timeline: [TimelineEntry('PENDING_ASSIGNMENT', _at), TimelineEntry('DELIVERED', _at)],
        journey: _journey,
        adjustments: [
          OrderAdjustment(id: 'req-1', reportedAt: _at, expiresAt: _at, open: false, lines: const [
            AdjustmentLine(
              id: 'a1',
              orderItemId: 'i2',
              name: 'Gaseosa',
              quantity: 2,
              unitCents: 300000,
              reason: 'UNAVAILABLE',
              decision: 'SUBSTITUTE',
              substitute: (name: 'Jugo de lulo', quantity: 2, unitCents: 350000),
            ),
            AdjustmentLine(id: 'a2', orderItemId: 'i1', name: 'Hamburguesa sencilla', quantity: 1, unitCents: 1400000, reason: 'PRICE_CHANGED', reportedUnitCents: 1600000, decision: 'ACCEPT_PRICE'),
            AdjustmentLine(id: 'a3', orderItemId: 'i3', name: 'Papas', quantity: 1, unitCents: 600000, reason: 'UNAVAILABLE', decision: 'EXPIRED_REMOVED'),
          ]),
        ],
      );
      await tester.pumpWidget(_app(const OrderDetailPage(code: 'RC-W9W5'), orders: _Orders(detail: detail)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('CAMBIOS EN TU PEDIDO'), findsOneWidget);
      expect(find.text('→ Jugo de lulo'), findsOneWidget);
      expect(find.text(r'Nuevo precio $ 16.000 c/u'), findsOneWidget);
      expect(find.text('Quitado por tiempo'), findsOneWidget);
      expect(find.text('PREGUNTA DE TU DOMICILIARIO'), findsNothing);
    });
  });
}
