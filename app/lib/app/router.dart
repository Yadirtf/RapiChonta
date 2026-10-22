import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/domain/entities/account.dart';
import '../features/auth/presentation/pages/account_page.dart';
import '../features/auth/presentation/pages/consents_page.dart';
import '../features/auth/presentation/pages/sign_in_page.dart';
import '../features/auth/presentation/providers/auth_providers.dart';
import '../features/courier/presentation/pages/courier_home_page.dart';
import '../features/courier/presentation/pages/trip_page.dart';
import '../features/establishments/presentation/pages/establishment_page.dart';
import '../features/establishments/presentation/pages/home_page.dart';
import '../features/notifications/presentation/pages/notifications_page.dart';
import '../features/orders/presentation/pages/checkout_page.dart';
import '../features/orders/presentation/pages/my_orders_page.dart';
import '../features/orders/presentation/pages/order_detail_page.dart';

/// Rutas que exigen sesión. El mapa es público: el ingreso se pide solo al confirmar el pedido (H01.1).
bool _protected(String path) =>
    path == '/cuenta' || path == '/pedido' || path == '/pedidos' || path.startsWith('/pedidos/') || path == '/avisos' || _courier(path);

/// Pantallas del modo domiciliario (E08).
bool _courier(String path) => path == '/turno' || path.startsWith('/turno/');

/// A dónde llega quien acaba de ingresar. El domiciliario aterriza en su turno aunque haya
/// entrado desde «Mi cuenta»: el perfil se abre encima del turno, nunca en su lugar.
String landingAfterSignIn(Account account, String? next) {
  if (account.activeRole == Role.courier) return next != null && _courier(next) ? next : '/turno';
  return next ?? '/';
}

/// Navegador raíz: los avisos push abren rutas y muestran su aviso encima de cualquier pantalla.
final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Puente entre la sesión (Riverpod) y las redirecciones del enrutador.
class _SessionListenable extends ChangeNotifier {
  _SessionListenable(Ref ref) {
    ref.listen<AsyncValue<Account?>>(sessionProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _SessionListenable(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      if (session.isLoading) return null;
      final account = session.value;
      final path = state.matchedLocation;

      // Documentos legales pendientes: nada más hasta aceptarlos.
      if (account != null && account.pendingConsents.isNotEmpty) return path == '/consentimientos' ? null : '/consentimientos';
      if (path == '/consentimientos') return account == null ? '/' : state.uri.queryParameters['next'] ?? '/';
      if (account == null && _protected(path)) return Uri(path: '/ingresar', queryParameters: {'next': state.uri.toString()}).toString();
      if (account != null && path == '/ingresar') return landingAfterSignIn(account, state.uri.queryParameters['next']);
      // En modo domiciliario el inicio es el turno; fuera de él, el turno no existe (RF-06).
      final courierMode = account?.activeRole == Role.courier;
      if (courierMode && path == '/') return '/turno';
      if (!courierMode && account != null && _courier(path)) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const HomePage()),
      GoRoute(path: '/local/:id', builder: (context, state) => EstablishmentPage(id: state.pathParameters['id']!)),
      GoRoute(path: '/ingresar', builder: (context, state) => SignInPage(next: _safeNext(state.uri.queryParameters['next']))),
      GoRoute(path: '/cuenta', builder: (context, state) => const AccountPage()),
      GoRoute(path: '/consentimientos', builder: (context, state) => const ConsentsPage()),
      GoRoute(path: '/pedido', builder: (context, state) => const CheckoutPage()),
      GoRoute(path: '/pedidos', builder: (context, state) => const MyOrdersPage()),
      GoRoute(path: '/avisos', builder: (context, state) => const NotificationsPage()),
      GoRoute(path: '/turno', builder: (context, state) => const CourierHomePage()),
      GoRoute(
        path: '/turno/pedido/:code',
        builder: (context, state) => TripPage(code: state.pathParameters['code']!, cancelled: state.uri.queryParameters['cancelado'] == '1'),
      ),
      GoRoute(
        path: '/pedidos/:code',
        builder: (context, state) => OrderDetailPage(code: state.pathParameters['code']!, placed: state.uri.queryParameters['nuevo'] == '1'),
      ),
    ],
  );
});

/// Solo rutas internas (evita redirecciones abiertas).
String? _safeNext(String? next) => next != null && next.startsWith('/') && !next.startsWith('//') ? next : null;
