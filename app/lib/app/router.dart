import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/domain/entities/account.dart';
import '../features/auth/presentation/pages/account_page.dart';
import '../features/auth/presentation/pages/consents_page.dart';
import '../features/auth/presentation/pages/sign_in_page.dart';
import '../features/auth/presentation/providers/auth_providers.dart';
import '../features/establishments/presentation/pages/establishment_page.dart';
import '../features/establishments/presentation/pages/home_page.dart';
import '../features/notifications/presentation/pages/notifications_page.dart';
import '../features/orders/presentation/pages/checkout_page.dart';
import '../features/orders/presentation/pages/my_orders_page.dart';
import '../features/orders/presentation/pages/order_detail_page.dart';

/// Rutas que exigen sesión. El mapa es público: el ingreso se pide solo al confirmar el pedido (H01.1).
bool _protected(String path) => path == '/cuenta' || path == '/pedido' || path == '/pedidos' || path.startsWith('/pedidos/') || path == '/avisos';

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
      if (account != null && path == '/ingresar') return state.uri.queryParameters['next'] ?? '/';
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
      GoRoute(
        path: '/pedidos/:code',
        builder: (context, state) => OrderDetailPage(code: state.pathParameters['code']!, placed: state.uri.queryParameters['nuevo'] == '1'),
      ),
    ],
  );
});

/// Solo rutas internas (evita redirecciones abiertas).
String? _safeNext(String? next) => next != null && next.startsWith('/') && !next.startsWith('//') ? next : null;
