import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/domain/entities/account.dart';
import '../features/auth/presentation/pages/account_page.dart';
import '../features/auth/presentation/pages/consents_page.dart';
import '../features/auth/presentation/pages/sign_in_page.dart';
import '../features/auth/presentation/providers/auth_providers.dart';
import '../features/establishments/presentation/pages/establishment_page.dart';
import '../features/establishments/presentation/pages/home_page.dart';

/// Rutas que exigen sesión. El mapa es público: el ingreso se pide solo al confirmar el pedido (H01.1).
const _protected = {'/cuenta'};

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
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      if (session.isLoading) return null;
      final account = session.value;
      final path = state.matchedLocation;

      // Documentos legales pendientes: nada más hasta aceptarlos.
      if (account != null && account.pendingConsents.isNotEmpty) return path == '/consentimientos' ? null : '/consentimientos';
      if (path == '/consentimientos') return account == null ? '/' : state.uri.queryParameters['next'] ?? '/';
      if (account == null && _protected.contains(path)) return Uri(path: '/ingresar', queryParameters: {'next': path}).toString();
      if (account != null && path == '/ingresar') return state.uri.queryParameters['next'] ?? '/';
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const HomePage()),
      GoRoute(path: '/local/:id', builder: (context, state) => EstablishmentPage(id: state.pathParameters['id']!)),
      GoRoute(path: '/ingresar', builder: (context, state) => SignInPage(next: _safeNext(state.uri.queryParameters['next']))),
      GoRoute(path: '/cuenta', builder: (context, state) => const AccountPage()),
      GoRoute(path: '/consentimientos', builder: (context, state) => const ConsentsPage()),
    ],
  );
});

/// Solo rutas internas (evita redirecciones abiertas).
String? _safeNext(String? next) => next != null && next.startsWith('/') && !next.startsWith('//') ? next : null;
