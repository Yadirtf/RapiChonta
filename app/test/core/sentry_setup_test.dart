import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/core/observability/sentry_setup.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

void main() {
  test('tapa teléfonos, correos y cédulas, pero no fechas ni códigos de pedido', () {
    expect(scrubText('No se pudo enviar el código a +57 300 123 4567'), 'No se pudo enviar el código a [número]');
    expect(scrubText('ana.perez@correo.co, cédula 1123456789'), '[correo], cédula [número]');
    expect(scrubText('Pedido RC-4F2K del 2026-10-21'), 'Pedido RC-4F2K del 2026-10-21');
  });

  test('el evento sale sin usuario ni ubicación en la URL', () {
    final event = scrubEvent(SentryEvent(
      exceptions: [SentryException(type: 'StateError', value: 'falló 3001234567')],
      user: SentryUser(id: '1', ipAddress: '1.2.3.4'),
      request: SentryRequest(url: 'https://x.test/api/v1/delivery/quote?lat=1.02&lng=-76.6', method: 'GET'),
      breadcrumbs: [Breadcrumb(message: 'llamar 3001234567', data: {'url': '/api/v1/delivery/coverage/check?lat=1'})],
    ));
    expect(event.exceptions!.single.value, 'falló [número]');
    expect(event.user, isNull);
    expect(event.request!.url, 'https://x.test/api/v1/delivery/quote');
    expect(event.breadcrumbs!.single.message, 'llamar [número]');
    expect(event.breadcrumbs!.single.data!['url'], '/api/v1/delivery/coverage/check');
  });
}
