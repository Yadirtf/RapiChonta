import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:rapichonta/app/router.dart';
import 'package:rapichonta/features/auth/domain/entities/account.dart';
import 'package:rapichonta/features/auth/presentation/pages/account_page.dart';
import 'package:rapichonta/features/auth/presentation/providers/auth_providers.dart';
import 'package:rapichonta/l10n/app_localizations.dart';

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

const _customer = Account(
  userId: 'u2',
  givenNames: 'Ana',
  familyNames: null,
  phone: '+573109998877',
  language: 'es',
  roles: [Role.customer],
  activeRole: Role.customer,
  pendingConsents: [],
);

class _Session extends SessionController {
  @override
  Future<Account?> build() async => _courier;
}

void main() {
  group('a dónde llega quien ingresa', () {
    test('el domiciliario llega a su turno aunque haya entrado desde «Mi cuenta»', () {
      expect(landingAfterSignIn(_courier, '/cuenta'), '/turno');
      expect(landingAfterSignIn(_courier, null), '/turno');
      expect(landingAfterSignIn(_courier, '/pedidos'), '/turno');
    });

    test('el domiciliario conserva un destino de su propio modo', () {
      expect(landingAfterSignIn(_courier, '/turno/pedido/RC-123'), '/turno/pedido/RC-123');
    });

    test('el cliente sigue a donde iba', () {
      expect(landingAfterSignIn(_customer, '/cuenta'), '/cuenta');
      expect(landingAfterSignIn(_customer, null), '/');
    });
  });

  testWidgets('Mi cuenta sin pantalla debajo: la flecha lleva al turno del domiciliario', (tester) async {
    final router = GoRouter(
      initialLocation: '/cuenta',
      redirect: (_, state) => state.matchedLocation == '/' ? '/turno' : null,
      routes: [
        GoRoute(path: '/', builder: (_, _) => const SizedBox()),
        GoRoute(path: '/turno', builder: (_, _) => const Scaffold(body: Text('turno'))),
        GoRoute(path: '/cuenta', builder: (_, _) => const AccountPage()),
      ],
    );
    await tester.pumpWidget(ProviderScope(
      overrides: [sessionProvider.overrideWith(_Session.new)],
      child: MaterialApp.router(
        locale: const Locale('es'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Volver al turno'));
    await tester.pumpAndSettle();
    expect(find.text('turno'), findsOneWidget);
  });
}
