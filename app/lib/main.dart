import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import 'app/app.dart';
import 'core/observability/sentry_setup.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Android: el mapa en un TextureView se compone como cualquier widget. Con el GLSurfaceView por defecto la vista
  // nativa queda por fuera del dibujo de Flutter y, al abrir otra pantalla encima (p. ej. el ingreso con el
  // teclado subiendo), el mapa de la pantalla de abajo se asoma unos cuadros sobre la nueva.
  MapLibreMap.useHybridComposition = true;
  await runWithSentry(() => const ProviderScope(child: RapiChontaApp()));
}
