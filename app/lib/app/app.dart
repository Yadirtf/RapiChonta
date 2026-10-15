import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';

import 'router.dart';
import 'theme.dart';

class RapiChontaApp extends StatelessWidget {
  const RapiChontaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'RapiChonta',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: appRouter,
      // Idioma del teléfono si es español o inglés; si no, español (primero de la lista).
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
    );
  }
}
