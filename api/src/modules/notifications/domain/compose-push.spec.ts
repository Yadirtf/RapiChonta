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
    for (const status of ['ACCEPTED', 'AT_ESTABLISHMENT', 'ON_THE_WAY', 'ARRIVING', 'DELIVERED', 'CANCELLED']) {
      const message = composePush(pending({ status }), texts)!;
      expect(`${message.title} ${message.body}`).not.toMatch(/\{\w+\}/);
    }
  });

  it('un tipo sin plantilla no se envía al teléfono', () => {
    expect(composePush(pending({ type: 'UNKNOWN' as never }), texts)).toBeNull();
  });
});
