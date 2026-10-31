import en from '../../../i18n/en.json';
import es from '../../../i18n/es.json';
import { pending } from '../../../../test/notifications/fakes';
import { composePush, PushTexts } from './compose-push';

const texts: PushTexts = { es, en };

describe('Texto de los avisos (H06.2)', () => {
  it('llega en el idioma del cliente, con el pedido y el local', () => {
    const es = composePush(pending({ status: 'ACCEPTED' }), texts)!;
    expect(es.title).toBe('Tu pedido ya tiene domiciliario');
    expect(es.body).toBe('Va rumbo a Asadero La Chonta por tu pedido RC-7K3M.');
    const en = composePush(pending({ status: 'ACCEPTED', language: 'en' }), texts)!;
    expect(en.body).toBe('Heading to Asadero La Chonta for your order RC-7K3M.');
  });

  it('un idioma sin archivo usa español y un estado sin texto propio usa el genérico', () => {
    expect(composePush(pending({ language: 'pt' }), texts)!.title).toBe('¡Tu pedido va en camino!');
    expect(composePush(pending({ status: 'PREPARING' }), texts)!.title).toBe('Tu pedido RC-7K3M cambió');
  });

  it('en un pedido directo (E15) el texto del modo gana: el domiciliario recoge, no compra', () => {
    const direct = (status: string) => composePush(pending({ status, fulfillmentMode: 'MERCHANT_DIRECT' }), texts)!;
    expect(direct('PENDING_ASSIGNMENT').title).toBe('Asadero La Chonta aceptó tu pedido');
    expect(direct('AT_ESTABLISHMENT').body).toBe('Está recogiendo tu pedido RC-7K3M.');
    // Sin variante del modo, el del estado.
    expect(direct('ON_THE_WAY').title).toBe('¡Tu pedido va en camino!');
    expect(composePush(pending({ status: 'AT_ESTABLISHMENT', fulfillmentMode: 'COURIER_PURCHASE' }), texts)!.body).toBe('Ya está comprando lo de tu pedido RC-7K3M.');
  });

  it('lleva los datos para abrir el pedido al tocarlo y una etiqueta por pedido', () => {
    const message = composePush(pending({ id: 'n-1', status: 'ARRIVING' }), texts)!;
    expect(message.data).toEqual({ type: 'ORDER_STATUS_CHANGED', notificationId: 'n-1', orderCode: 'RC-7K3M', status: 'ARRIVING' });
    expect(message.tag).toBe('RC-7K3M');
    expect(message.highPriority).toBe(true);
  });

  it('cada plantilla existe en todos los idiomas y sin marcadores huérfanos', () => {
    const keys = (catalog: object, prefix = ''): string[] =>
      Object.entries(catalog).flatMap(([key, value]) => (typeof value === 'object' ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]));
    expect(keys(en)).toEqual(keys(es));
    for (const status of ['ACCEPTED', 'AT_ESTABLISHMENT', 'ON_THE_WAY', 'ARRIVING', 'PENDING_REVIEW', 'DELIVERED', 'CANCELLED']) {
      const message = composePush(pending({ status }), texts)!;
      expect(`${message.title} ${message.body}`).not.toMatch(/\{\w+\}/);
    }
  });

  it('el cierre de un caso dice cómo quedó, según la resolución; sin resolución conocida usa el genérico', () => {
    const resolved = (variant?: string) => composePush(pending({ type: 'INCIDENT_RESOLVED' as never, status: null, params: variant ? { variant } : null }), texts)!;
    expect(resolved('RESOLVED_AS_DELIVERED').body).toBe('Quedó como entregado. Gracias por la paciencia.');
    expect(resolved('RESOLVED_AS_CANCELLED').body).toBe('Lo cancelamos. Toca para ver el detalle del caso.');
    expect(resolved().body).toBe('Ya cerramos el caso. Toca para ver cómo quedó.');
    expect(resolved('NO_ORDER_CHANGE').title).toBe('Revisamos el pedido RC-7K3M');
    // A quién va (cliente o domiciliario) viaja con el aviso para abrir la pantalla de cada uno.
    const courier = composePush(pending({ type: 'INCIDENT_RESOLVED' as never, status: null, params: { variant: 'RESOLVED_AS_DELIVERED', audience: 'COURIER' } }), texts)!;
    expect(courier.data).toMatchObject({ type: 'INCIDENT_RESOLVED', audience: 'COURIER' });
    expect(resolved().data).not.toHaveProperty('audience');
  });

  it('un tipo sin plantilla no se envía al teléfono', () => {
    expect(composePush(pending({ type: 'UNKNOWN' as never }), texts)).toBeNull();
  });
});
