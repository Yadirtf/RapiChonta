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
    GoRoute(path: '/turno/pedido/:code', builder: (_, state) => TripPage(code: state.pathParameters['code']!)),
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
    expect(find.text('Nequi'), findsOneWidget);
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

  testWidgets('donde el cliente: el código equivocado dice cuántos intentos quedan; el correcto entrega', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 2400));
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
}
