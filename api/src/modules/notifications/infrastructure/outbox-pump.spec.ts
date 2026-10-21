import { MemoryOutbox, pending } from '../../../../test/notifications/fakes';
import { NotificationDispatcher } from '../application/notification-dispatcher';
import { OutboxPump } from './outbox-pump';

const OPTIONS = { activeMs: 5_000, idleMs: 600_000, batchSize: 2 };

function setup(active = false) {
  const outbox = new MemoryOutbox();
  outbox.active = active;
  const dispatcher = { drainOnce: jest.fn(async () => (await outbox.claim(OPTIONS.batchSize)).length) } as unknown as NotificationDispatcher;
  const pump = new OutboxPump(dispatcher, outbox, OPTIONS);
  const schedule = jest.spyOn(pump as unknown as { schedule: (ms: number) => void }, 'schedule').mockImplementation(() => undefined);
  return { outbox, dispatcher, pump, schedule };
}

describe('Bandeja de salida', () => {
  it('vacía lotes completos seguidos y, tras repartir, vuelve pronto', async () => {
    const { outbox, dispatcher, pump, schedule } = setup();
    outbox.queue.push(pending(), pending(), pending());
    await pump.run();
    expect(dispatcher.drainOnce).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenLastCalledWith(OPTIONS.activeMs);
  });

  it('sin avisos ni pedidos en curso espera mucho (la base puede dormir); con pedidos en curso, poco', async () => {
    const idle = setup(false);
    await idle.pump.run();
    expect(idle.schedule).toHaveBeenLastCalledWith(OPTIONS.idleMs);
    const busy = setup(true);
    await busy.pump.run();
    expect(busy.schedule).toHaveBeenLastCalledWith(OPTIONS.activeMs);
  });

  it('un aviso que llega mientras reparte se toma en la misma pasada', async () => {
    const { outbox, dispatcher, pump } = setup();
    (dispatcher.drainOnce as jest.Mock).mockImplementationOnce(async () => {
      outbox.queue.push(pending());
      pump.kick();
      return 0;
    });
    await pump.run();
    expect(outbox.queue).toHaveLength(0);
  });
});
