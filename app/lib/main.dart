import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/observability/sentry_setup.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await runWithSentry(() => const ProviderScope(child: RapiChontaApp()));
}
