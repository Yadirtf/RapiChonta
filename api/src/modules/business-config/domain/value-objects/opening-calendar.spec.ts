import { OpeningCalendar } from './opening-calendar';
import { normalizeDay, parseClock, TimeSlot } from './time-slot';

const BOGOTA = 'America/Bogota';
const day = (...slots: [string, string][]) => normalizeDay(slots.map(([opensAt, closesAt]) => ({ opensAt, closesAt })));
/** Lunes a sábado 08:00–14:00 y 16:00–22:00; domingo 09:00–13:00. */
const weekly = [day(['09:00', '13:00']), ...Array.from({ length: 6 }, () => day(['08:00', '14:00'], ['16:00', '22:00']))];
// 2026-10-19 es lunes. Bogotá es UTC-5 todo el año.
const at = (local: string) => new Date(`${local}-05:00`);

describe('Horario de operación (H03.2)', () => {
  it('valida las horas y las franjas de un día', () => {
    expect(parseClock('08:30')).toBe(510);
    expect(parseClock('24:00')).toBe(1440);
    expect(() => parseClock('8:30')).toThrow(expect.objectContaining({ code: 'INVALID_TIME' }));
    expect(() => parseClock('25:00')).toThrow(expect.objectContaining({ code: 'INVALID_TIME' }));
    expect(() => day(['14:00', '08:00'])).toThrow(expect.objectContaining({ code: 'INVALID_TIME_SLOT' }));
    expect(() => day(['24:00', '24:00'])).toThrow(expect.objectContaining({ code: 'INVALID_TIME_SLOT' }));
    expect(() => day(['08:00', '14:00'], ['13:00', '18:00'])).toThrow(expect.objectContaining({ code: 'OVERLAPPING_TIME_SLOTS' }));
    expect(() => day(['01:00', '02:00'], ['03:00', '04:00'], ['05:00', '06:00'], ['07:00', '08:00'], ['09:00', '10:00'])).toThrow(
      expect.objectContaining({ code: 'TOO_MANY_TIME_SLOTS' }),
    );
    // Seguidas pero sin cruzarse: válidas y ordenadas.
    expect(day(['16:00', '22:00'], ['08:00', '16:00']).map((s) => s.toJSON())).toEqual([
      { opensAt: '08:00', closesAt: '16:00' },
      { opensAt: '16:00', closesAt: '22:00' },
    ]);
  });

  it('abierto dentro de una franja, con la hora de cierre', () => {
    const state = new OpeningCalendar(BOGOTA, weekly).stateAt(at('2026-10-19T10:15:00'));
    expect(state).toEqual({ open: true, closesAt: at('2026-10-19T14:00:00'), nextOpeningAt: null });
  });

  it('cerrado entre franjas: abre a las 4:00 p. m. del mismo día', () => {
    const state = new OpeningCalendar(BOGOTA, weekly).stateAt(at('2026-10-19T14:00:00'));
    expect(state).toEqual({ open: false, closesAt: null, nextOpeningAt: at('2026-10-19T16:00:00') });
  });

  it('de noche abre al día siguiente, y el sábado por la noche abre el domingo a las 9', () => {
    const calendar = new OpeningCalendar(BOGOTA, weekly);
    expect(calendar.stateAt(at('2026-10-19T23:30:00')).nextOpeningAt).toEqual(at('2026-10-20T08:00:00'));
    expect(calendar.stateAt(at('2026-10-24T22:30:00')).nextOpeningAt).toEqual(at('2026-10-25T09:00:00'));
  });

  it('usa la hora de Colombia aunque el servidor esté en UTC', () => {
    // 02:00 UTC del martes = 21:00 del lunes en Bogotá: abierto.
    const state = new OpeningCalendar(BOGOTA, weekly).stateAt(new Date('2026-10-20T02:00:00Z'));
    expect(state.open).toBe(true);
    expect(state.closesAt).toEqual(new Date('2026-10-20T03:00:00Z'));
  });

  it('une franjas que cruzan la medianoche', () => {
    const late = [day(['18:00', '24:00']), day(['00:00', '02:00']), [], [], [], [], []];
    const state = new OpeningCalendar(BOGOTA, late).stateAt(at('2026-10-18T23:00:00'));
    expect(state).toEqual({ open: true, closesAt: at('2026-10-19T02:00:00'), nextOpeningAt: null });
  });

  it('los días especiales mandan sobre el horario semanal (festivo cerrado, horario corto)', () => {
    const overrides = new Map<string, TimeSlot[]>([
      ['2026-10-19', []],
      ['2026-10-20', day(['10:00', '12:00'])],
    ]);
    const calendar = new OpeningCalendar(BOGOTA, weekly, overrides);
    expect(calendar.stateAt(at('2026-10-19T10:00:00'))).toEqual({ open: false, closesAt: null, nextOpeningAt: at('2026-10-20T10:00:00') });
    expect(calendar.stateAt(at('2026-10-20T11:00:00')).closesAt).toEqual(at('2026-10-20T12:00:00'));
    expect(calendar.stateAt(at('2026-10-20T12:30:00')).nextOpeningAt).toEqual(at('2026-10-21T08:00:00'));
  });

  it('sin horario configurado está cerrado y sin próxima apertura', () => {
    expect(new OpeningCalendar(BOGOTA, [[], [], [], [], [], [], []]).stateAt(at('2026-10-19T10:00:00'))).toEqual({
      open: false,
      closesAt: null,
      nextOpeningAt: null,
    });
  });

  it('respeta cambios de horario de verano en otras zonas', () => {
    // Madrid pasa de UTC+2 a UTC+1 el 2026-10-25: las 09:00 locales del lunes 26 son 08:00 UTC.
    const calendar = new OpeningCalendar('Europe/Madrid', [[], day(['09:00', '17:00']), [], [], [], [], []]);
    expect(calendar.stateAt(new Date('2026-10-25T12:00:00Z')).nextOpeningAt).toEqual(new Date('2026-10-26T08:00:00Z'));
    expect(calendar.localDate(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-26');
  });
});
