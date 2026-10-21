import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/domain/entities/account.dart';
import '../features/auth/presentation/providers/auth_providers.dart';
import '../features/courier/presentation/courier_providers.dart';
import '../features/notifications/presentation/push_controller.dart';
import '../l10n/app_localizations.dart';
import 'router.dart';
import 'theme.dart';

class RapiChontaApp extends ConsumerWidget {
  const RapiChontaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Push (E06): el token del teléfono va con la sesión; al salir se suelta en SessionController.signOut.
    ref.listen<AsyncValue<Account?>>(sessionProvider, (previous, next) {
      final before = previous?.value?.userId;
      final now = next.value?.userId;
      if (now != null && now != before) ref.read(pushControllerProvider).start(now);
      if (now == null && before != null) ref.read(pushControllerProvider).stop();
    });
    // Modo domiciliario (E08): el GPS y la cola sin señal siguen con cualquier pantalla abierta.
    ref.watch(courierShiftProvider);
    return MaterialApp.router(
      title: 'RapiChonta',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: ref.watch(routerProvider),
      // Idioma elegido (guardado en la cuenta); si no hay, el del teléfono si es español o inglés; si no, español.
      locale: ref.watch(localeControllerProvider),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
    );
  }
}
