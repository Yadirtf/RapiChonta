import { resolveOccurredAt } from './event-time';

const now = new Date('2026-10-21T15:00:00Z');
const floor = new Date('2026-10-21T14:30:00Z');

describe('resolveOccurredAt (H08.8)', () => {
  it('en línea vale la hora del servidor, aunque el teléfono mande otra', () => {
    expect(resolveOccurredAt({ clientEventId: 'e', occurredAt: new Date('2026-10-21T14:40:00Z'), queued: false }, floor, now)).toEqual({ at: now, offline: false });
  });

  it('desde la cola sin señal acepta la hora original si es coherente', () => {
    const claimed = new Date('2026-10-21T14:42:00Z');
    expect(resolveOccurredAt({ clientEventId: 'e', occurredAt: claimed, queued: true }, floor, now)).toEqual({ at: claimed, offline: true });
  });

  it('una hora anterior al último cambio, del futuro o de hace días se reemplaza por la de llegada', () => {
    for (const claimed of ['2026-10-21T14:00:00Z', '2026-10-21T15:10:00Z', '2026-10-19T15:00:00Z']) {
      expect(resolveOccurredAt({ clientEventId: 'e', occurredAt: new Date(claimed), queued: true }, floor, now)).toEqual({ at: now, offline: true });
    }
  });

  it('unos segundos adelantado se acepta pero nunca queda en el futuro', () => {
    expect(resolveOccurredAt({ clientEventId: 'e', occurredAt: new Date('2026-10-21T15:00:30Z'), queued: true }, floor, now).at).toEqual(now);
  });
});
