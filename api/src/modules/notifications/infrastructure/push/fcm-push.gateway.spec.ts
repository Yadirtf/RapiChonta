import { generateKeyPairSync } from 'node:crypto';
import { PushMessage } from '../../domain/push-message';
import { FcmPushGateway } from './fcm-push.gateway';
import { parseServiceAccount } from './google-access-token';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const account = parseServiceAccount(Buffer.from(JSON.stringify({ project_id: 'rapichonta', client_email: 'push@rapichonta.iam', private_key: privateKey })).toString('base64'));

const message: PushMessage = {
  title: '¡Tu pedido va en camino!',
  body: 'Salió de Asadero La Chonta',
  data: { type: 'ORDER_STATUS_CHANGED', notificationId: 'n-1', orderCode: 'RC-7K3M', status: 'ON_THE_WAY' },
  highPriority: true,
  tag: 'RC-7K3M',
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fcmError = (status: number, code: string, errorCode?: string, text = '') =>
  json(status, { error: { code: status, status: code, message: text, details: errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : [] } });

function gateway(responses: (url: string) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const http = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return String(url).includes('oauth2') ? json(200, { access_token: `ya29.${calls.length}`, expires_in: 3600 }) : responses(String(url));
  }) as unknown as typeof fetch;
  return { fcm: new FcmPushGateway(account, http), calls };
}

describe('FCM HTTP v1', () => {
  it('firma el JWT una vez, lo reutiliza y envía a cada token con marca y prioridad', async () => {
    const { fcm, calls } = gateway(() => json(200, { name: 'projects/rapichonta/messages/1' }));
    const outcomes = await fcm.send(message, ['tok-a', 'tok-b']);
    expect(outcomes).toEqual([
      { kind: 'sent', providerMessageId: 'projects/rapichonta/messages/1' },
      { kind: 'sent', providerMessageId: 'projects/rapichonta/messages/1' },
    ]);
    const oauth = calls.filter((c) => c.url.includes('oauth2'));
    expect(oauth).toHaveLength(1);
    const assertion = new URLSearchParams(String(oauth[0].init.body)).get('assertion')!;
    expect(JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString())).toMatchObject({ iss: 'push@rapichonta.iam', scope: 'https://www.googleapis.com/auth/firebase.messaging' });
    const send = calls.find((c) => c.url.endsWith('/v1/projects/rapichonta/messages:send'))!;
    expect(send.init.headers).toMatchObject({ Authorization: 'Bearer ya29.1' });
    expect(JSON.parse(String(send.init.body)).message).toMatchObject({
      token: 'tok-a',
      data: message.data,
      android: { priority: 'high', collapse_key: 'RC-7K3M', notification: { icon: 'ic_stat_rapichonta', color: '#E4572E', tag: 'RC-7K3M' } },
      apns: { headers: { 'apns-priority': '10', 'apns-collapse-id': 'RC-7K3M' } },
    });
  });

  it('clasifica las respuestas: token inexistente, de otro proyecto, cuota y caída', async () => {
    const byToken: Record<string, Response> = {
      gone: fcmError(404, 'NOT_FOUND', 'UNREGISTERED'),
      other: fcmError(403, 'PERMISSION_DENIED', 'SENDER_ID_MISMATCH'),
      malformed: fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token'),
      payload: fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'Invalid value at message.data'),
      quota: fcmError(429, 'RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'),
      down: json(503, {}),
    };
    const http = jest.fn(async (url: string | URL | Request, init?: RequestInit) =>
      String(url).includes('oauth2') ? json(200, { access_token: 't', expires_in: 3600 }) : byToken[JSON.parse(String(init!.body)).message.token],
    ) as unknown as typeof fetch;
    const classified = await new FcmPushGateway(account, http).send(message, Object.keys(byToken));
    expect(classified).toEqual([
      { kind: 'invalidToken', errorCode: 'UNREGISTERED' },
      { kind: 'invalidToken', errorCode: 'SENDER_ID_MISMATCH' },
      { kind: 'invalidToken', errorCode: 'INVALID_ARGUMENT' },
      { kind: 'failed', errorCode: 'INVALID_ARGUMENT', retryable: false },
      { kind: 'failed', errorCode: 'QUOTA_EXCEEDED', retryable: true },
      { kind: 'failed', errorCode: 'HTTP_503', retryable: true },
    ]);
  });

  it('ante un 401 pide otro token de acceso y repite una vez', async () => {
    let sends = 0;
    const { fcm, calls } = gateway(() => (++sends === 1 ? json(401, {}) : json(200, { name: 'm-2' })));
    expect(await fcm.send(message, ['tok-a'])).toEqual([{ kind: 'sent', providerMessageId: 'm-2' }]);
    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(2);
  });

  it('rechaza una cuenta de servicio incompleta', () => {
    expect(() => parseServiceAccount('{"project_id":"x"}')).toThrow(/cuenta de servicio/);
  });
});
