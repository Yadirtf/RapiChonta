import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:rapichonta/features/auth/domain/entities/account.dart';
import 'package:rapichonta/features/auth/presentation/providers/auth_providers.dart';
import 'package:rapichonta/features/courier/data/courier_repository_impl.dart';
import 'package:rapichonta/features/courier/data/location_tracker.dart';
import 'package:rapichonta/features/courier/data/pending_steps_store.dart';
import 'package:rapichonta/features/courier/domain/courier.dart';
import 'package:rapichonta/features/courier/presentation/courier_providers.dart';
import 'package:rapichonta/features/courier/presentation/pages/courier_home_page.dart';
import 'package:rapichonta/features/courier/presentation/pages/trip_page.dart';
import 'package:rapichonta/features/courier/presentation/widgets/duty_widgets.dart';
import 'package:rapichonta/features/orders/domain/entities/adjustment.dart';
import 'package:rapichonta/l10n/app_localizations.dart';

import 'courier_fakes.dart';

const _courier = Account(
  userId: 'u1',
  givenNames: 'Wilmer',
  familyNames: 'Jansasoy',
  phone: '+573101112233',
  language: 'es',
  roles: [Role.customer, Role.courier],
  activeRole: Role.courier,
  pendingConsents: [],
);

class _Session extends SessionController {
  @override
  Future<Account?> build() async => _courier;
}

Widget _app(String location, FakeCourierRepository repository) {
  final router = GoRouter(initialLocation: location, routes: [
    GoRoute(path: '/turno', builder: (_, _) => const CourierHomePage()),
    GoRoute(
      path: '/turno/pedido/:code',
      builder: (_, state) => TripPage(code: state.pathParameters['code']!, cancelled: state.uri.queryParameters['cancelado'] == '1'),
    ),
    GoRoute(path: '/cuenta', builder: (_, _) => const SizedBox()),
  ]);
  return ProviderScope(
    overrides: [
      sessionProvider.overrideWith(_Session.new),
      courierRepositoryProvider.overrideWithValue(repository),
      pendingStepsStoreProvider.overrideWithValue(MemoryPendingStepsStore()),
      locationAccessProvider.overrideWith((_) async => LocationAccess.granted),
    ],
    child: MaterialApp.router(
      locale: const Locale('es'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
    ),
  );
}

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  // Lo que depende de la sesión y del turno (cuentas de cobro, cobros pendientes) llega un cuadro después.
  await tester.pump();
  await tester.pump();
}

void main() {
  setUp(() => TestWidgetsFlutterBinding.ensureInitialized());

  testWidgets('descansando: la palanca explica qué pasa al activarla', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 1400));
    await tester.pumpWidget(_app('/turno', FakeCourierRepository()));
    await _settle(tester);

    expect(find.text('Hola, Wilmer'), findsOneWidget);
    expect(find.text('Descansando'), findsOneWidget);
    expect(find.text('Estás descansando'), findsOneWidget);
    expect(find.byType(DutySwitch), findsOneWidget);
    expect(find.text('Pasar a cliente'), findsOneWidget);
  });

  testWidgets('disponible: la oferta muestra local, productos, compra, ganancia y la cuenta regresiva', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 1600));
    final repository = FakeCourierRepository(
      currentStatus: CourierStatus(verified: true, locationConsentPending: false, availableSince: DateTime.utc(2026, 10, 21, 20, 40)),
      currentOffers: [offerFromJson(offerJson())],
    );
    await tester.pumpWidget(_app('/turno', repository));
    await _settle(tester);
    await _settle(tester);

    expect(find.text('Disponible'), findsOneWidget);
    expect(find.text('En turno desde las 3:40 p. m.'), findsOneWidget);
    expect(find.text('Pedido para ti'.toUpperCase()), findsOneWidget);
    expect(find.text('Asadero El Chontaduro'), findsOneWidget);
    expect(find.text('Pollo asado entero'), findsOneWidget);
    expect(find.text(r'$ 38.500'), findsOneWidget);
    expect(find.text(r'$ 3.000'), findsOneWidget);
    expect(find.text('640 m al local'), findsOneWidget);
    expect(find.text('Tomar pedido'), findsOneWidget);

    await tester.tap(find.text('Tomar pedido'));
    await _settle(tester);
    // Tomado: abre el pedido en curso (sin pedido en la API de prueba, se ve como terminado).
    expect(find.text('Pedido terminado'), findsOneWidget);
  });

  testWidgets('en el local: lista, total pagado y factura son obligatorios', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2400));
    final repository = FakeCourierRepository(currentTrip: tripFromJson(tripJson(status: 'AT_ESTABLISHMENT')));
    await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
    await _settle(tester);

    // La cuenta del pedido: productos, domicilio y lo que cobra al entregar, desde la compra.
    expect(find.text('Cuenta del pedido'.toUpperCase()), findsOneWidget);
    expect(find.text(r'$ 38.500'), findsOneWidget);
    expect(find.text(r'$ 3.000'), findsOneWidget);
    expect(find.text(r'$ 41.500'), findsOneWidget);
    expect(find.text('Nequi'), findsOneWidget);

    expect(find.text('Bien dorado'), findsOneWidget);
    expect(find.text('Timbre dañado, llamar'), findsOneWidget);
    await tester.tap(find.text('Pollo asado entero'));
    await tester.pump();
    expect(find.text('1 de 2 en la canasta'), findsOneWidget);

    await tester.tap(find.text('Pagué y tengo la factura'));
    await tester.pump();
    expect(find.text('Escribe el total que pagaste'), findsOneWidget);
    expect(find.text('Falta la foto de la factura'), findsOneWidget);
    expect(repository.steps, isEmpty);

    await tester.enterText(find.byType(TextField), '39000');
    await tester.pump();
    expect(find.text('39.000'), findsOneWidget);
    expect(find.textContaining(r'$ 500 más'), findsOneWidget);
  });

  testWidgets('preparando, con el tiempo cumplido: "ya está listo" y "sigue en preparación"', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 1800));
    final repository = FakeCourierRepository(currentTrip: tripFromJson(tripJson(status: 'PREPARING', prepared: true)));
    await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
    await _settle(tester);

    expect(find.text('¿Ya está listo?'), findsOneWidget);
    expect(find.text('Avisaste 1 retraso'), findsOneWidget);
    expect(find.text(r'$ 39.000'), findsOneWidget);
    expect(find.text(r'$ 41.500'), findsOneWidget);
    await tester.tap(find.text('Sigue en preparación'));
    await _settle(tester);
    expect(repository.steps.single.kind, 'delay');

    await tester.tap(find.text('Ya está listo, salgo'));
    await _settle(tester);
    expect(repository.steps.map((s) => s.kind), ['delay', 'ready']);
  });

  testWidgets('en camino: destino, quién recibe y cuánto cobrar; sin la ubicación de nadie más', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2000));
    final repository = FakeCourierRepository(currentTrip: tripFromJson(tripJson(status: 'ON_THE_WAY', revealed: true, prepared: true)));
    await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
    await _settle(tester);

    expect(find.text('Casa'), findsOneWidget);
    expect(find.text('Portón verde frente al parque'), findsOneWidget);
    expect(find.text('Rosa Mutumbajoy'), findsOneWidget);
    expect(find.text(r'$ 41.500'), findsOneWidget);
    expect(find.text('Dijo que paga con Nequi'), findsOneWidget);
    expect(find.text('Cuando estés cerca le avisamos al cliente para que salga a recibir.'), findsOneWidget);
  });

  testWidgets('en camino: "Llegué" por si la geocerca no lo detecta', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2000));
    final repository = FakeCourierRepository(currentTrip: tripFromJson(tripJson(status: 'ON_THE_WAY', revealed: true, prepared: true, delivery: {'codeAttemptsLeft': 5})));
    await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
    await _settle(tester);

    await tester.tap(find.text('Llegué'));
    await _settle(tester);
    expect(repository.steps.single.kind, 'arrived');
  });

  testWidgets('donde el cliente: primero el cobro (dividido en dos medios) y luego el código', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2600));
    final now = DateTime.now().toUtc();
    final repository = FakeCourierRepository(
      currentTrip: tripFromJson(tripJson(status: 'ARRIVING', revealed: true, prepared: true, delivery: {
        'arrivedAt': now.toIso8601String(),
        'proofAvailableAt': now.add(const Duration(minutes: 5)).toIso8601String(),
        'codeAttemptsLeft': 5,
      })),
    )..accounts = const [nequiAccount];
    await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
    await _settle(tester);

    expect(find.text('¿Cómo te pagó?'), findsOneWidget);
    expect(find.text('Dijo que paga con Nequi'), findsOneWidget);
    // Sin cobro no se pide el código; sin QR, se ofrece subirlo.
    expect(find.text('Primero registra cómo te pagó; luego pide el código.'), findsOneWidget);
    expect(find.text('Te quedan 5 intentos'), findsNothing);
    expect(find.text('Subir el QR de mi Nequi'), findsOneWidget);
    expect(find.text('Cuadra con el pedido'), findsOneWidget);

    // Parte por Nequi y parte en efectivo.
    await tester.enterText(find.byType(TextField).first, '30000');
    await tester.pump();
    expect(find.text('Faltan \$ 11.500'), findsOneWidget);
    await tester.tap(find.text('Pagó con dos medios'));
    await tester.pump();
    expect(find.text('Cuadra con el pedido'), findsOneWidget);
    await tester.tap(find.text('Cobré \$ 41.500'));
    await _settle(tester);

    expect(repository.collected.single, const [
      CollectedPayment(paymentMethod: 'NEQUI', amountCents: 3000000),
      CollectedPayment(paymentMethod: 'CASH', amountCents: 1150000),
    ]);
    expect(find.text('COBRADO'), findsOneWidget);
    expect(find.text('Te quedan 5 intentos'), findsOneWidget);
  });

  testWidgets('si no cuadra, lo dice antes de registrar', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2600));
    final now = DateTime.now().toUtc();
    final repository = FakeCourierRepository(
      currentTrip: tripFromJson(tripJson(status: 'ARRIVING', revealed: true, prepared: true, delivery: {
        'arrivedAt': now.toIso8601String(),
        'proofAvailableAt': now.add(const Duration(minutes: 5)).toIso8601String(),
        'codeAttemptsLeft': 5,
      })),
    );
    await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
    await _settle(tester);

    // Sin cuenta Nequi: se avisa y el cobro va en efectivo.
    expect(find.textContaining('no tienes esa cuenta registrada'), findsOneWidget);
    await tester.tap(find.text('Efectivo'));
    await tester.enterText(find.byType(TextField).first, '40000');
    await tester.pump();
    await tester.tap(find.text('Cobré \$ 40.000'));
    await _settle(tester);
    expect(find.text('Faltan \$ 1.500'), findsNWidgets(2));
    await tester.tap(find.text('Registrar así'));
    await _settle(tester);
    expect(repository.collected.single, const [CollectedPayment(paymentMethod: 'CASH', amountCents: 4000000)]);
  });

  testWidgets('en el turno: las entregas sin cobro se registran desde el aviso', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2400));
    final repository = FakeCourierRepository()
      ..pending = [
        PendingCollection(code: 'RC-7K3M', status: 'PENDING_REVIEW', storeName: 'Asadero El Chontaduro', customerTotalCents: 4150000, paymentMethod: 'CASH', closedAt: DateTime.utc(2026, 10, 21, 21)),
      ];
    await tester.pumpWidget(_app('/turno', repository));
    await _settle(tester);

    expect(find.text('1 entrega sin cobro registrado'), findsOneWidget);
    await tester.tap(find.text('1 entrega sin cobro registrado'));
    await _settle(tester);
    await tester.tap(find.text('Asadero El Chontaduro'));
    await _settle(tester);
    await tester.tap(find.text('Cobré \$ 41.500'));
    await _settle(tester);
    expect(repository.collected.single, const [CollectedPayment(paymentMethod: 'CASH', amountCents: 4150000)]);
    expect(find.text('Todo cobrado. ¡Caja al día!'), findsOneWidget);
  });

  testWidgets('donde el cliente: el código equivocado dice cuántos intentos quedan; el correcto entrega', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2400));
    final now = DateTime.now().toUtc();
    final repository = FakeCourierRepository(
      currentTrip: tripFromJson(tripJson(status: 'ARRIVING', revealed: true, prepared: true, collection: paidCollection, delivery: {
        'arrivedAt': now.toIso8601String(),
        'proofAvailableAt': now.add(const Duration(minutes: 5)).toIso8601String(),
        'codeAttemptsLeft': 5,
      })),
    );
    await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
    await _settle(tester);

    expect(find.text('Código de entrega'), findsOneWidget);
    expect(find.text('Te quedan 5 intentos'), findsOneWidget);
    // Sin código, la foto espera los minutos en el punto.
    expect(find.textContaining('Entregar con foto en 4:'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '1111');
    await _settle(tester);
    expect(find.text('Ese no es el código. Te quedan 4 intentos.'), findsOneWidget);
    expect(repository.steps, isEmpty);

    await tester.enterText(find.byType(TextField), fakeDeliveryCode);
    await _settle(tester);
    expect(repository.steps.single.kind, 'deliver');
    expect(find.text('¡Pedido entregado! Ya puedes recibir otro.'), findsOneWidget);
  });

  testWidgets('sin intentos de código: la foto se habilita de una vez', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2400));
    final now = DateTime.now().toUtc();
    final repository = FakeCourierRepository(
      currentTrip: tripFromJson(tripJson(status: 'ARRIVING', revealed: true, prepared: true, delivery: {
        'arrivedAt': now.toIso8601String(),
        'proofAvailableAt': now.add(const Duration(minutes: 5)).toIso8601String(),
        'codeAttemptsLeft': 0,
      })),
    );
    await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
    await _settle(tester);

    expect(find.text('Entregar pedido'), findsNothing);
    final button = tester.widget<OutlinedButton>(find.ancestor(of: find.text('Entregar con foto'), matching: find.byWidgetPredicate((w) => w is OutlinedButton)));
    expect(button.onPressed, isNotNull);
  });

  group('E09: producto faltante o precio distinto', () {
    testWidgets('en el local marca lo que falta y el precio nuevo, y le pregunta al cliente en una sola consulta', (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 2400));
      final repository = FakeCourierRepository(currentTrip: tripFromJson(tripJson(status: 'AT_ESTABLISHMENT')));
      await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
      await _settle(tester);

      await tester.tap(find.text('Falta algo o cambió un precio'));
      await _settle(tester);
      expect(find.text('¿Qué pasó en el local?'), findsOneWidget);
      expect(find.text('Marca al menos un producto'), findsOneWidget);

      // La gaseosa se acabó; el pollo, otro precio (primero el mismo de antes: no cuenta como cambio).
      await tester.tap(find.text('No hay').last);
      await tester.tap(find.text('Otro precio').first);
      await tester.pump();
      await tester.enterText(find.byType(TextField).last, '32500');
      await tester.pump();
      await tester.tap(find.text('Preguntar al cliente por 2 productos'));
      await _settle(tester);
      expect(find.text('Es el mismo precio de antes.'), findsOneWidget);
      expect(repository.reported, isEmpty);

      await tester.enterText(find.byType(TextField).last, '34500');
      await tester.pump();
      await tester.tap(find.text('Preguntar al cliente por 2 productos'));
      await _settle(tester);
      expect(repository.steps.single.kind, 'adjustments');
      expect(repository.steps.single.queued, isFalse);
      expect(repository.reported.single, const [
        ReportedLine(orderItemId: 'item-gaseosa', reason: 'UNAVAILABLE'),
        ReportedLine(orderItemId: 'item-pollo', reason: 'PRICE_CHANGED', unitPesos: 34500),
      ]);
      expect(find.text('¿Qué pasó en el local?'), findsNothing);
    });

    testWidgets('sin señal la pregunta no se encola: lo dice y deja intentarlo de nuevo', (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 2400));
      final repository = FakeCourierRepository(currentTrip: tripFromJson(tripJson(status: 'AT_ESTABLISHMENT')))..offlineSteps = true;
      await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
      await _settle(tester);

      await tester.tap(find.text('Falta algo o cambió un precio'));
      await _settle(tester);
      await tester.tap(find.text('No hay').first);
      await tester.pump();
      await tester.tap(find.text('Preguntar al cliente por 1 producto'));
      await _settle(tester);
      expect(find.text('Sin señal no se le puede preguntar al cliente. Intenta de nuevo cuando vuelva.'), findsOneWidget);
      expect(repository.reported, isEmpty);
    });

    testWidgets('esperando al cliente: el reloj y lo que ya respondió línea por línea', (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 2400));
      final repository = FakeCourierRepository(
        currentTrip: tripFromJson(tripJson(status: 'AWAITING_CUSTOMER', adjustment: adjustmentJson(open: true, gaseosa: 'SUBSTITUTE'))),
      );
      await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
      await _settle(tester);

      expect(find.text('Esperando al cliente'), findsOneWidget);
      expect(find.text('Le preguntamos por 2 productos. Ve comprando lo demás.'), findsOneWidget);
      expect(find.text('Cómpralo cambiado: 2× Jugo de lulo 1 L'), findsOneWidget);
      expect(find.text('Esperando respuesta'), findsOneWidget);
      expect(find.text('0:00'), findsOneWidget);
    });

    testWidgets('de vuelta en el local: qué decidió el cliente', (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 2600));
      final repository = FakeCourierRepository(
        currentTrip: tripFromJson(tripJson(status: 'AT_ESTABLISHMENT', adjustment: adjustmentJson(open: false, gaseosa: 'REMOVE_ITEM', pollo: 'ACCEPT_PRICE'))),
      );
      await tester.pumpWidget(_app('/turno/pedido/RC-7K3M', repository));
      await _settle(tester);

      expect(find.text('El cliente respondió'), findsOneWidget);
      expect(find.text('No lo compres'), findsOneWidget);
      expect(find.text('Cómpralo al precio nuevo'), findsOneWidget);
    });

    testWidgets('el aviso de cancelación abre el pedido y dice que no compre nada', (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 1600));
      await tester.pumpWidget(_app('/turno/pedido/RC-7K3M?cancelado=1', FakeCourierRepository()));
      await _settle(tester);

      expect(find.text('El pedido se canceló'), findsOneWidget);
      expect(find.text('No compres nada. Ya quedas libre para tomar otro pedido.'), findsOneWidget);
    });
  });
}
