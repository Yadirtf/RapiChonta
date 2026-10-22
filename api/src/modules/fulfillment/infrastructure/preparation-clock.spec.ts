import { Notifier } from '../../notifications/application/notifier';
import { FakeDeliveryReviewWatch, FakePreparationWatch } from '../../../../test/fulfillment/fakes';
import { nextPreparationDelay, PreparationClock } from './preparation-clock';

const options = { idleMs: 300_000, minMs: 1_000 };

describe('PreparationClock (H08.5)', () => {
  afterEach(() => jest.useRealTimers());

  it('duerme hasta la próxima revisión, con piso y techo', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    expect(nextPreparationDelay(null, now, options)).toBe(300_000);
    expect(nextPreparationDelay(new Date('2026-10-21T12:00:40Z'), now, options)).toBe(40_000);
    expect(nextPreparationDelay(new Date('2026-10-21T11:59:00Z'), now, options)).toBe(1_000);
    expect(nextPreparationDelay(new Date('2026-10-21T13:00:00Z'), now, options)).toBe(300_000);
  });

  it('encola los avisos vencidos, despierta al repartidor y vuelve a la hora de la próxima', async () => {
    jest.useFakeTimers();
    const watch = new FakePreparationWatch();
    const notifier = { kick: jest.fn() };
    const clock = new PreparationClock(watch, notifier as unknown as Notifier, options);
    const now = new Date('2026-10-21T12:00:00Z');
    watch.queued = 2;
    watch.next = new Date('2026-10-21T12:05:00Z');
    await clock.run(() => now);
    expect(notifier.kick).toHaveBeenCalledTimes(1);
    watch.queued = 0;
    jest.advanceTimersByTime(299_999);
    expect(watch.runs).toBe(1);
    jest.advanceTimersByTime(1);
    expect(watch.runs).toBe(2);
    clock.onApplicationShutdown();
  });

  it('también cierra las entregas con foto vencidas y duerme hasta la más próxima de las dos horas', async () => {
    jest.useFakeTimers();
    const watch = new FakePreparationWatch();
    const review = new FakeDeliveryReviewWatch();
    const notifier = { kick: jest.fn() };
    const clock = new PreparationClock(watch, notifier as unknown as Notifier, options, review);
    const now = new Date('2026-10-21T12:00:00Z');
    review.closed = 1;
    watch.next = new Date('2026-10-21T12:04:00Z');
    review.next = new Date('2026-10-21T12:01:00Z');
    await clock.run(() => now);
    expect(review.runs).toBe(1);
    expect(notifier.kick).toHaveBeenCalledTimes(1);
    review.closed = 0;
    jest.advanceTimersByTime(59_999);
    expect(watch.runs).toBe(1);
    jest.advanceTimersByTime(1);
    expect(watch.runs).toBe(2);
    clock.onApplicationShutdown();
  });
});
