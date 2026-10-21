import 'package:flutter/widgets.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../config/env.dart';

/// Arranca la app con Sentry (H05.4) cuando se compiló con `--dart-define=SENTRY_DSN=…`; sin DSN, arranca normal.
/// La versión (`com.rapichonta.app@0.1.0+<build>`) la pone el SDK con el número de compilación del APK.
Future<void> runWithSentry(Widget Function() app) async {
  if (Env.sentryDsn.isEmpty) {
    runApp(app());
    return;
  }
  await SentryFlutter.init(
    (options) => options
      ..dsn = Env.sentryDsn
      ..environment = Env.sentryEnvironment
      ..sendDefaultPii = false
      ..attachScreenshot = false
      ..attachViewHierarchy = false
      ..beforeSend = (event, hint) => scrubEvent(event),
    appRunner: () => runApp(app()),
  );
}

/// Teléfonos, correos y series largas de dígitos (cédula, cuenta) que el cliente pudo escribir.
final _rules = <(RegExp, String)>[
  (RegExp(r'[\w.+-]+@[\w-]+\.[\w.-]+'), '[correo]'),
  (RegExp(r'(\+?57[\s-]?)?\b3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b'), '[número]'),
  (RegExp(r'\b\d{7,}\b'), '[número]'),
];

String scrubText(String text) => _rules.fold(text, (value, rule) => value.replaceAll(rule.$1, rule.$2));

/// Sin `?lat=…&lng=…`: la ubicación del cliente también es un dato personal.
String _withoutQuery(String url) => url.split(RegExp(r'[?#]')).first;

/// Nada personal sale del teléfono: textos tapados, sin usuario y URLs sin consulta.
SentryEvent scrubEvent(SentryEvent event) {
  final message = event.message;
  if (message != null) message.formatted = scrubText(message.formatted);
  for (final exception in event.exceptions ?? const <SentryException>[]) {
    final value = exception.value;
    if (value != null) exception.value = scrubText(value);
  }
  event.user = null;
  final url = event.request?.url;
  if (url != null) event.request = SentryRequest(url: _withoutQuery(url), method: event.request?.method);
  for (final crumb in event.breadcrumbs ?? const <Breadcrumb>[]) {
    final text = crumb.message;
    if (text != null) crumb.message = scrubText(text);
    final crumbUrl = crumb.data?['url'];
    if (crumbUrl is String) crumb.data = {...?crumb.data, 'url': _withoutQuery(crumbUrl)};
  }
  return event;
}
