import { PushMessage } from '../../domain/push-message';
import { HmsPushGateway } from './hms-push.gateway';

const message: PushMessage = {
  title: 'Tu domiciliario está llegando',
  body: 'Sal a recibir tu pedido RC-7K3M.',
  data: { type: 'ORDER_STATUS_CHANGED', notificationId: 'n-1', orderCode: 'RC-7K3M', status: 'ARRIVING' },
  highPriority: true,
  tag: 'RC-7K3M',
};
const options = { appId: '110000001', clientId: '110000001', clientSecret: 's3cr3t', clickActivity: 'com.rapichonta.rapichonta/.MainActivity', category: 'EXPRESS' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function gateway(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const http = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return String(url).includes('oauth2') ? json(200, { access_token: `hms-${calls.length}`, expires_in: 3600 }) : responses.shift()!;
  }) as unknown as typeof fetch;
  return { hms: new HmsPushGateway(options, http), calls };
}

describe('Huawei Push Kit', () => {
  it('envía un solo mensaje a todos los tokens, con la marca y la acción que abre el pedido', async () => {
    const { hms, calls } = gateway([json(200, { code: '80000000', msg: 'Success', requestId: 'r-1' })]);
    expect(await hms.send(message, ['h-1', 'h-2'])).toEqual([
      { kind: 'sent', providerMessageId: 'r-1' },
      { kind: 'sent', providerMessageId: 'r-1' },
    ]);
    expect(new URLSearchParams(String(calls[0].init.body)).get('grant_type')).toBe('client_credentials');
    expect(calls[1].url).toBe('https://push-api.cloud.huawei.com/v1/110000001/messages:send');
    const body = JSON.parse(String(calls[1].init.body));
    expect(body.message.token).toEqual(['h-1', 'h-2']);
    expect(body.message.android).toMatchObject({
      urgency: 'HIGH',
      category: 'EXPRESS',
      notification: { icon: '/raw/ic_stat_rapichonta', color: '#E4572E', tag: 'RC-7K3M', importance: 'NORMAL', click_action: { type: 1 } },
    });
    expect(body.message.android.notification.click_action.intent).toBe(
      'intent:#Intent;action=android.intent.action.MAIN;component=com.rapichonta.rapichonta/.MainActivity;launchFlags=0x4000000;' +
        'S.rc_type=ORDER_STATUS_CHANGED;S.rc_notificationId=n-1;S.rc_orderCode=RC-7K3M;S.rc_status=ARRIVING;end',
    );
  });

  it('éxito parcial: solo los tokens ilegales se dan de baja', async () => {
    const { hms } = gateway([json(200, { code: '80100000', msg: JSON.stringify({ success: 1, failure: 1, illegal_tokens: ['h-2'] }), requestId: 'r-2' })]);
    expect(await hms.send(message, ['h-1', 'h-2'])).toEqual([
      { kind: 'sent', providerMessageId: 'r-2' },
      { kind: 'invalidToken', errorCode: '80100000' },
    ]);
  });

  it('todos los tokens inválidos, error interno reintentable y token de acceso vencido', async () => {
    expect(await gateway([json(200, { code: '80300007' })]).hms.send(message, ['h-1'])).toEqual([{ kind: 'invalidToken', errorCode: '80300007' }]);
    expect(await gateway([json(500, { code: '81000001' })]).hms.send(message, ['h-1'])).toEqual([{ kind: 'failed', errorCode: '81000001', retryable: true }]);
    const { hms, calls } = gateway([json(401, { code: '80200003' }), json(200, { code: '80000000', requestId: 'r-3' })]);
    expect(await hms.send(message, ['h-1'])).toEqual([{ kind: 'sent', providerMessageId: 'r-3' }]);
    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(2);
  });

  it('sin categoría aprobada no pide importancia normal', () => {
    const plain = new HmsPushGateway({ ...options, category: undefined });
    const android = plain.payload(message, ['h-1']).message.android;
    expect(android).not.toHaveProperty('category');
    expect(android.notification).not.toHaveProperty('importance');
  });
});
