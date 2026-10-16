import 'dart:async';
import 'dart:ui';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_client.dart';
import '../../data/datasources/identity_remote_datasource.dart';
import '../../data/repositories/identity_repository_impl.dart';
import '../../data/storage/session_storage.dart';
import '../../data/token_manager.dart';
import '../../domain/entities/account.dart';
import '../../domain/repositories/account_repository.dart';
import '../../domain/repositories/auth_repository.dart';

// ── Inyección de dependencias: único lugar donde se conectan los adaptadores ──

final sessionStorageProvider = Provider<SessionStorage>((ref) => SecureSessionStorage());

final tokenManagerProvider = Provider<TokenManager>(
  (ref) => TokenManager(publicDio: buildApiClient(), storage: ref.watch(sessionStorageProvider)),
);

/// Dio con token: lo agrega a cada petición y renueva la sesión ante un 401.
final authedDioProvider = Provider<Dio>((ref) {
  final dio = buildApiClient();
  dio.interceptors.add(AuthInterceptor(ref.watch(tokenManagerProvider), dio));
  return dio;
});

final _identityRepositoryProvider = Provider<IdentityRepositoryImpl>(
  (ref) => IdentityRepositoryImpl(
    IdentityRemoteDataSource(public: buildApiClient(), authed: ref.watch(authedDioProvider), storage: ref.watch(sessionStorageProvider)),
    ref.watch(tokenManagerProvider),
  ),
);

final authRepositoryProvider = Provider<AuthRepository>((ref) => ref.watch(_identityRepositoryProvider));
final accountRepositoryProvider = Provider<AccountRepository>((ref) => ref.watch(_identityRepositoryProvider));

// ── Estado de la sesión ──

/// La cuenta con sesión abierta, o null. Al abrir la app recupera la sesión guardada.
class SessionController extends AsyncNotifier<Account?> {
  StreamSubscription<void>? _ended;

  @override
  Future<Account?> build() async {
    final auth = ref.watch(authRepositoryProvider);
    _ended?.cancel();
    _ended = auth.sessionEnded.listen((_) => state = const AsyncData(null));
    ref.onDispose(() => _ended?.cancel());
    try {
      final account = await auth.restore();
      if (account != null) await ref.read(localeControllerProvider.notifier).adopt(account.language);
      return account;
    } catch (_) {
      // Sin red al abrir: se entra como invitado; el token se conserva para la próxima vez.
      return null;
    }
  }

  /// Sesión iniciada o cuenta actualizada (perfil, celular, consentimientos, cambio de modo).
  Future<void> signedIn(Account account) async {
    state = AsyncData(account);
    await ref.read(localeControllerProvider.notifier).adopt(account.language);
  }

  void replace(Account account) => state = AsyncData(account);

  Future<void> signOut() async {
    await ref.read(authRepositoryProvider).signOut();
    state = const AsyncData(null);
  }

  /// La cuenta se eliminó (los tokens ya se borraron).
  void closed() => state = const AsyncData(null);

  Future<void> switchRole(Role role, {String? password}) async {
    state = AsyncData(await ref.read(authRepositoryProvider).switchRole(role, password: password));
  }
}

final sessionProvider = AsyncNotifierProvider<SessionController, Account?>(SessionController.new);

// ── Idioma ──

/// Idioma de la app: el elegido (guardado en el teléfono y en la cuenta) o, si no hay, el del teléfono.
class LocaleController extends Notifier<Locale?> {
  static const supported = ['es', 'en'];

  @override
  Locale? build() {
    ref.read(sessionStorageProvider).readLanguage().then((saved) {
      if (saved != null && supported.contains(saved)) state = Locale(saved);
    });
    return null;
  }

  /// El idioma guardado en la cuenta manda al entrar (se recuerda entre dispositivos).
  Future<void> adopt(String language) async {
    if (!supported.contains(language)) return;
    state = Locale(language);
    await ref.read(sessionStorageProvider).writeLanguage(language);
  }

  /// El usuario elige idioma: se guarda en el teléfono y, con sesión, en la cuenta.
  Future<void> choose(String language) async {
    await adopt(language);
    final account = ref.read(sessionProvider).value;
    if (account != null && account.language != language) {
      ref.read(sessionProvider.notifier).replace(await ref.read(accountRepositoryProvider).setLanguage(language));
    }
  }
}

final localeControllerProvider = NotifierProvider<LocaleController, Locale?>(LocaleController.new);
