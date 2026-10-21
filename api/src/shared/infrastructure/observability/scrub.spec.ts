import type { ErrorEvent } from '@sentry/nestjs';
import { scrubEvent, scrubText, withoutQuery } from './scrub';

describe('datos personales fuera de logs y eventos', () => {
  it('tapa teléfonos, correos y los valores que PostgreSQL copia en el mensaje', () => {
    expect(scrubText('Key (phone)=(3001234567) already exists.')).toBe('Key (phone)=(…) already exists.');
    expect(scrubText('Twilio rechazó +57 300 123 4567')).toBe('Twilio rechazó [número]');
    expect(scrubText('escribió a ana.perez@correo.co')).toBe('escribió a [correo]');
    expect(scrubText('cédula 1123456789')).toBe('cédula [número]');
    expect(scrubText('pedido RC-4F2K en 25 ms, tasa del 2026-10-21')).toBe('pedido RC-4F2K en 25 ms, tasa del 2026-10-21');
  });

  it('quita la ubicación de la consulta', () => {
    expect(withoutQuery('/api/v1/delivery/coverage/check?lat=1.02&lng=-76.6')).toBe('/api/v1/delivery/coverage/check');
  });

  it('el evento sale sin cuerpo, cookies, consulta ni usuario', () => {
    const event = scrubEvent({
      type: undefined,
      exception: { values: [{ type: 'Error', value: 'falló 3001234567' }] },
      request: {
        method: 'POST',
        url: 'https://x.test/api/v1/orders?lat=1',
        data: { address: 'Calle 5 # 3-20' },
        cookies: { rc_refresh: 'x' },
        query_string: 'lat=1',
        headers: { authorization: 'Bearer x', 'user-agent': 'Chrome' },
      },
      user: { ip_address: '1.2.3.4' },
      extra: { body: 'x' },
      breadcrumbs: [{ data: { url: '/api/v1/delivery/quote?lat=1' } }],
    } as ErrorEvent);
    expect(event.exception?.values?.[0].value).toBe('falló [número]');
    expect(event.request).toEqual({ method: 'POST', url: 'https://x.test/api/v1/orders', headers: { 'user-agent': 'Chrome' } });
    expect(event.user).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.breadcrumbs?.[0].data?.url).toBe('/api/v1/delivery/quote');
  });
});
