import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/core/map/map_images.dart';
import 'package:rapichonta/core/map/map_style.dart';
import 'package:rapichonta/features/establishments/presentation/widgets/nearby_map.dart' show PlacePin;

void main() {
  group('estilo del mapa', () {
    final liberty = {
      'version': 8,
      'sources': {
        'openmaptiles': {'type': 'vector', 'url': 'https://tiles.openfreemap.org/planet'},
      },
      'layers': [
        {'id': 'background', 'type': 'background', 'paint': {'background-color': '#000'}},
        {'id': 'water', 'type': 'fill', 'source': 'openmaptiles', 'paint': {'fill-color': '#000', 'fill-antialias': true}},
        {'id': 'road_minor', 'type': 'line', 'source': 'openmaptiles', 'paint': {'line-color': '#000', 'line-width': 2}},
        {'id': 'building-3d', 'type': 'fill-extrusion', 'source': 'openmaptiles', 'paint': {'fill-extrusion-color': '#000'}},
        {'id': 'label_town', 'type': 'symbol', 'source': 'openmaptiles', 'paint': {'text-color': '#000'}},
      ],
    };

    test('repinta con la paleta de la web sin perder el resto de la pintura', () {
      final layers = {for (final l in paintRapiChonta(liberty)['layers'] as List) l['id']: l['paint']};
      expect(layers['background']['background-color'], '#fbf3e4');
      expect(layers['water'], {'fill-color': '#5cb8e6', 'fill-antialias': true});
      expect(layers['road_minor'], {'line-color': '#ffffff', 'line-width': 2});
      expect(layers['building-3d']['fill-extrusion-color'], '#f1d2bc');
      expect(layers['label_town']['text-halo-color'], '#fff9ee');
    });

    test('el relieve va apagado, bajo la primera vía, con su fuente de elevación', () {
      final style = paintRapiChonta(liberty);
      final ids = [for (final l in style['layers'] as List) l['id']];
      expect(ids, ['background', 'water', hillshadeLayerId, 'road_minor', 'building-3d', 'label_town']);
      final hillshade = (style['layers'] as List).firstWhere((l) => l['id'] == hillshadeLayerId);
      expect(hillshade['layout'], {'visibility': 'none'});
      expect((style['sources'] as Map).keys, containsAll(['openmaptiles', hillshade['source']]));
    });
  });

  testWidgets('los pines se pintan a PNG para el mapa', (tester) async {
    final bytes = await tester.runAsync(
      () => MapImages.render(MapImages.pin(const PlacePin(icon: 'store', open: true)), MapImages.pinSize, 2),
    );
    // Firma PNG.
    expect(bytes!.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
  });

  testWidgets('el pin con el logo del local también se pinta, abierto y cerrado', (tester) async {
    final logo = await tester.runAsync(() {
      final recorder = ui.PictureRecorder();
      Canvas(recorder).drawRect(const Rect.fromLTWH(0, 0, 32, 32), Paint()..color = Colors.green);
      return recorder.endRecording().toImage(32, 32);
    });
    for (final open in [true, false]) {
      final bytes = await tester.runAsync(
        () => MapImages.render(MapImages.logoPin(PlacePin(icon: 'store', logo: logo, open: open, selected: open)), MapImages.logoPinSize, 2),
      );
      expect(bytes!.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
    }
  });
}
