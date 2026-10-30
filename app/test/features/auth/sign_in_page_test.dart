import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/auth/presentation/pages/sign_in_page.dart';
import 'package:rapichonta/l10n/app_localizations.dart';

void main() {
  testWidgets('el teclado del celular se abre cuando la pantalla de ingreso terminó de entrar', (tester) async {
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          navigatorKey: navigator,
          locale: const Locale('es'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          home: const Scaffold(body: Text('mapa')),
        ),
      ),
    );

    navigator.currentState!.push(MaterialPageRoute<void>(builder: (_) => const SignInPage()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    final phone = find.byType(EditableText).first;
    // En plena transición: nada enfocado, así el teclado no redimensiona la pantalla de abajo.
    expect(tester.widget<EditableText>(phone).focusNode.hasFocus, isFalse);

    await tester.pumpAndSettle();
    expect(tester.widget<EditableText>(phone).focusNode.hasFocus, isTrue);
  });
}
