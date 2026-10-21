import en from '../../../i18n/en.json';
import es from '../../../i18n/es.json';
import { MemoryOutbox, pending, target } from '../../../../test/notifications/fakes';
import { PUSH_PROVIDERS } from '../domain/notifications.codes';
import { FakePushGateway } from '../infrastructure/push/fake-push.gateway';
import { ConfiguredPushGateways } from '../infrastructure/push/push-gateways';
import { DEFAULT_DISPATCH_OPTIONS, NotificationDispatcher } from './notification-dispatcher';

function setup(providers = [PUSH_PROVIDERS.FCM, PUSH_PROVIDERS.HMS]) {
  const outbox = new MemoryOutbox();
  const gateways = providers.map((p) => new FakePushGateway(p));
  const waits: number[] = [];
  const dispatcher = new NotificationDispatcher(outbox, new ConfiguredPushGateways(gateways), { es, en }, DEFAULT_DISPATCH_OPTIONS, async (ms) => waits.push(ms));
  return { outbox, gateways, waits, dispatcher };
}

describe('Reparto de avisos (H06.1)', () => {
  it('envía por el proveedor de cada token y deja un intento enviado por token', async () => {
    const { outbox, gateways, dispatcher } = setup();
    outbox.queue.push(pending({ targets: [target('fcm-aaaa'), target('hms-bbbb', 'HMS')] }));
    expect(await dispatcher.drainOnce()).toBe(1);
    expect(gateways[0].sent.map((s) => s.token)).toEqual(['fcm-aaaa']);
    expect(gateways[1].sent.map((s) => s.token)).toEqual(['hms-bbbb']);
    expect(outbox.attempts.map((a) => a.status)).toEqual(['SENT', 'SENT']);
  });

  it('da de baja los tokens que el proveedor rechaza, sin reintentarlos', async () => {
    const { outbox, dispatcher } = setup();
    outbox.queue.push(pending({ targets: [target('invalid-cccc'), target('fcm-dddd')] }));
    await dispatcher.drainOnce();
    expect(outbox.invalidated).toEqual(['id-invalid-cccc']);
    expect(outbox.attempts.filter((a) => a.tokenId === 'id-invalid-cccc')).toEqual([expect.objectContaining({ status: 'FAILED', errorCode: 'UNREGISTERED' })]);
  });

  it('reintenta las fallas pasajeras con espera creciente; cada intento es una fila', async () => {
    const { outbox, waits, dispatcher } = setup();
    outbox.queue.push(pending({ targets: [target('flaky-eeee'), target('down-ffff')] }));
    await dispatcher.drainOnce();
    expect(outbox.attempts.filter((a) => a.tokenId === 'id-flaky-eeee').map((a) => a.status)).toEqual(['FAILED', 'SENT']);
    expect(outbox.attempts.filter((a) => a.tokenId === 'id-down-ffff').map((a) => a.status)).toEqual(['FAILED', 'FAILED', 'FAILED']);
    expect(waits).toEqual([1_000, 4_000]);
    expect(outbox.invalidated).toEqual([]);
  });

  it('un proveedor sin credenciales no se intenta; sin destinos el aviso queda solo en la bandeja', async () => {
    const { outbox, dispatcher } = setup([PUSH_PROVIDERS.FCM]);
    outbox.queue.push(pending({ targets: [target('hms-gggg', 'HMS')] }), pending({ targets: [] }));
    expect(await dispatcher.drainOnce()).toBe(2);
    expect(outbox.attempts).toEqual([]);
  });

  it('si el proveedor no responde, cuenta como falla pasajera', async () => {
    const { outbox, gateways, dispatcher } = setup([PUSH_PROVIDERS.FCM]);
    jest.spyOn(gateways[0], 'send').mockRejectedValue(new Error('ECONNRESET'));
    outbox.queue.push(pending({ targets: [target('fcm-hhhh')] }));
    await dispatcher.drainOnce();
    expect(outbox.attempts.map((a) => a.errorCode)).toEqual(['PROVIDER_UNREACHABLE', 'PROVIDER_UNREACHABLE', 'PROVIDER_UNREACHABLE']);
  });
});
