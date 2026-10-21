import { DispatchMaintenance } from '../domain/ports/dispatch-maintenance';
import { DispatchClock } from './dispatch-clock';

class FakeMaintenance extends DispatchMaintenance {
  expired = 0;
  next: Date | null = null;
  async expireOffers() {
    this.expired++;
    return 0;
  }
  async nextExpiry() {
    return this.next;
  }
  idleClosed: number[] = [];
  async closeIdleAvailability(minutes: number) {
    this.idleClosed.push(minutes);
    return 0;
  }
  async purgeLocations() {
    return 0;
  }
}

describe('DispatchClock', () => {
  afterEach(() => jest.useRealTimers());

  it('vence lo vencido y duerme hasta justo después de la próxima oferta', async () => {
    jest.useFakeTimers();
    const maintenance = new FakeMaintenance();
    const clock = new DispatchClock(maintenance, { idleMs: 300_000, graceMs: 250, minMs: 1_000 });
    const now = new Date('2026-10-21T12:00:00Z');
    maintenance.next = new Date('2026-10-21T12:00:30Z');
    await clock.run(() => now);
    expect(maintenance.expired).toBe(1);
    expect(maintenance.idleClosed).toEqual([15]);
    jest.advanceTimersByTime(30_000);
    expect(maintenance.expired).toBe(1);
    maintenance.next = null;
    jest.advanceTimersByTime(300);
    await Promise.resolve();
    expect(maintenance.expired).toBe(2);
    clock.onApplicationShutdown();
  });
});
