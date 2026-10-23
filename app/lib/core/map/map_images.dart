import 'dart:ui' as ui;

import 'package:flutter/foundation.dart' show Uint8List, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

/// Los pines del mapa son widgets de Flutter (los mismos de antes), pintados una vez a PNG y entregados a
/// MapLibre como imágenes del estilo. Así el mapa los dibuja en la GPU, también inclinado en 3D.
class MapImages {
  MapImages._();

  static final _rendered = <String, Future<Uint8List>>{};

  /// Agrega al estilo la imagen [name] dibujada desde [build] en un lienzo de [size] puntos. Se pinta una sola
  /// vez por sesión; tras recrear el estilo (Android puede hacerlo) basta volver a llamar.
  static Future<void> add(MapLibreMapController map, String name, Size size, Widget Function() build, double pixelRatio) async {
    final bytes = await _rendered.putIfAbsent('$name@$pixelRatio', () => render(build(), size, pixelRatio));
    await map.addImage(name, bytes);
  }

  /// Lienzo de los pines en gota (48 × 52, como los marcadores de antes): con aire arriba y a los lados para
  /// la gota girada, su sombra y la escala del seleccionado. Se ancla abajo, en la punta.
  static const pinSize = Size(64, 64);
  static Widget pin(Widget drop) => Align(alignment: Alignment.bottomCenter, child: SizedBox(width: 48, height: 52, child: drop));

  /// MapLibre toma la imagen a 1 píxel por punto: con este tamaño de ícono queda en su tamaño lógico y nítida.
  static double iconSize(double pixelRatio) => 1 / pixelRatio;

  @visibleForTesting
  static Future<Uint8List> render(Widget widget, Size size, double pixelRatio) async {
    final boundary = RenderRepaintBoundary();
    final view = WidgetsBinding.instance.platformDispatcher.implicitView ?? WidgetsBinding.instance.platformDispatcher.views.first;
    final renderView = RenderView(
      view: view,
      child: RenderPositionedBox(alignment: Alignment.center, child: boundary),
      configuration: ViewConfiguration(logicalConstraints: BoxConstraints.tight(size), devicePixelRatio: pixelRatio),
    );
    final pipeline = PipelineOwner()..rootNode = renderView;
    renderView.prepareInitialFrame();
    final build = BuildOwner(focusManager: FocusManager());
    final root = RenderObjectToWidgetAdapter<RenderBox>(
      container: boundary,
      child: MediaQuery(
        data: MediaQueryData(size: size, devicePixelRatio: pixelRatio),
        child: Directionality(textDirection: TextDirection.ltr, child: SizedBox.fromSize(size: size, child: widget)),
      ),
    ).attachToRenderTree(build);
    build
      ..buildScope(root)
      ..finalizeTree();
    pipeline
      ..flushLayout()
      ..flushCompositingBits()
      ..flushPaint();
    final image = await boundary.toImage(pixelRatio: pixelRatio);
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      return data!.buffer.asUint8List();
    } finally {
      image.dispose();
    }
  }
}

