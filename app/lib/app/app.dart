import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/presentation/providers/auth_providers.dart';
import '../l10n/app_localizations.dart';
import 'router.dart';
import 'theme.dart';

class RapiChontaApp extends ConsumerWidget {
  const RapiChontaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
