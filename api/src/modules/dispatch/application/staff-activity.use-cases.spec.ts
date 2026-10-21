import { activity, MemoryStaffActivity, operator } from '../../../../test/dispatch/fakes';
import { ActivityCursor, StaffActivityUseCase } from './staff-activity.use-cases';

describe('StaffActivityUseCase', () => {
  it('pagina con un cursor opaco y respeta el alcance del administrador', async () => {
    const reader = new MemoryStaffActivity();
    reader.rows = [activity('a', '2026-10-21T15:00:00Z'), activity('b', '2026-10-21T14:00:00Z'), activity('c', '2026-10-21T13:00:00Z')];
    const page = await new StaffActivityUseCase(reader).list(operator(1), { limit: 2, orderCode: 'rc 7k3m' });
    expect(page.entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(reader.queries[0]).toMatchObject({ municipalityId: 1, orderCode: 'RC-7K3M', limit: 3 });
    expect(ActivityCursor.decode(page.nextCursor!)).toEqual({ occurredAt: new Date('2026-10-21T14:00:00Z'), id: 'b' });
  });

  it('un cursor dañado se ignora', () => {
    expect(ActivityCursor.decode('basura')).toBeUndefined();
  });
});
