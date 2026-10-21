import { SettingsReader } from '../../../shared/infrastructure/settings/settings.reader';
import { admin, MemoryMunicipalities, MemorySchedule, MemorySettings, MemoryZones, scopedAdmin } from '../../../../test/business/fakes';
import { MunicipalityScope } from './municipality-scope';
import { EnsureOpenForOrders, GetBusinessStatusUseCase, ManageScheduleUseCase, OpeningHours } from './schedule.use-cases';
import { ManageCommissionUseCase, ManageSettingsUseCase } from './settings.use-cases';
import { ManageZonesUseCase, QuoteDeliveryUseCase, ZoneInput } from './zones.use-cases';

/** Barrio de ~200 m × 200 m en el centro de Villagarzón. */
const CENTRO: [number, number][] = [
  [-76.617, 1.029],
  [-76.615, 1.029],
  [-76.615, 1.031],
  [-76.617, 1.031],
];
const zone = (overrides: Partial<ZoneInput> = {}): ZoneInput => ({ name: '  Barrio   Centro ', kind: 'URBAN', area: CENTRO, fee: '3000', ...overrides });

function setup() {
  const municipalities = new MemoryMunicipalities();
  const scope = new MunicipalityScope(municipalities);
  const zones = new MemoryZones();
  const schedule = new MemorySchedule();
  const settings = new MemorySettings();
  const hours = new OpeningHours(schedule);
  const reader = { invalidate: jest.fn() } as unknown as SettingsReader;
  return {
    municipalities,
    zones,
    schedule,
    settings,
    reader,
    manageZones: new ManageZonesUseCase(zones, scope),
    quote: new QuoteDeliveryUseCase(zones),
    manageSchedule: new ManageScheduleUseCase(schedule, scope, hours),
    status: new GetBusinessStatusUseCase(scope, hours),
    ensureOpen: new EnsureOpenForOrders(scope, hours),
    manageSettings: new ManageSettingsUseCase(settings, scope, reader),
    commission: new ManageCommissionUseCase(settings, scope),
  };
}

describe('Zonas de entrega (H03.1)', () => {
  it('crea la zona con nombre limpio y tarifa decimal, en el único municipio lanzado', async () => {
    const { manageZones } = setup();
    const created = await manageZones.create(admin, zone({ fee: '3500,5' }));
    expect(created).toMatchObject({ name: 'Barrio Centro', kind: 'URBAN', fee: '3500.50', municipalityId: 1 });
  });

  it('rechaza nombre repetido, tarifa inválida y polígonos fuera de los límites de una zona', async () => {
    const { manageZones } = setup();
    await manageZones.create(admin, zone());
    await expect(manageZones.create(admin, zone({ name: 'barrio centro' }))).rejects.toMatchObject({ code: 'ZONE_NAME_TAKEN' });
    await expect(manageZones.create(admin, zone({ name: 'Otro', fee: '0' }))).rejects.toMatchObject({ code: 'INVALID_PRICE' });
    const tiny: [number, number][] = [
      [-76.617, 1.029],
      [-76.6169, 1.029],
      [-76.6169, 1.0291],
    ];
    await expect(manageZones.create(admin, zone({ name: 'Diminuta', area: tiny }))).rejects.toMatchObject({ code: 'INVALID_AREA', details: { reason: 'TOO_SMALL' } });
  });

  it('avisa con qué zonas se superpone, y con trimOverlaps guarda recortado', async () => {
    const { manageZones, zones } = setup();
    zones.overlapping = [{ id: 'z-x', name: 'La Esperanza', overlapSquareMeters: 820 }];
    await expect(manageZones.create(admin, zone())).rejects.toMatchObject({
      code: 'ZONE_OVERLAP',
      details: { zones: [{ id: 'z-x', name: 'La Esperanza', overlapSquareMeters: 820 }] },
    });
    zones.trimResult = 'SPLIT';
    await expect(manageZones.create(admin, zone({ trimOverlaps: true }))).rejects.toMatchObject({ code: 'ZONE_TRIM_SPLIT' });
    zones.trimResult = CENTRO.slice(0, 3);
    await expect(manageZones.create(admin, zone({ trimOverlaps: true }))).resolves.toMatchObject({ name: 'Barrio Centro' });
  });

  it('cambiar solo la tarifa agrega una versión; cambiar el polígono crea otra zona y da de baja la anterior', async () => {
    const { manageZones, zones } = setup();
    const created = await manageZones.create(admin, zone());
    const renamed = await manageZones.update(admin, created.id, zone({ name: 'Centro', fee: '3500' }));
    expect(renamed.id).toBe(created.id);
    expect(zones.fees.map((f) => f.fee)).toEqual(['3000.00', '3500.00']);
    const moved = await manageZones.update(admin, created.id, zone({ name: 'Centro', fee: '3500', area: [...CENTRO.slice(0, 3), [-76.6172, 1.0312]] }));
    expect(moved.id).not.toBe(created.id);
    expect(await zones.find(created.id)).toBeNull();
  });

  it('cotiza con la zona que cubre el punto, o responde sin cobertura', async () => {
    const { manageZones, quote, zones } = setup();
    zones.establishments.set('est-1', 1);
    await manageZones.create(admin, zone());
    await expect(quote.execute({ establishmentId: 'est-1', latitude: 1.03, longitude: -76.616 })).resolves.toMatchObject({ fee: '3000.00', zone: { name: 'Barrio Centro' } });
    await expect(quote.execute({ establishmentId: 'est-1', latitude: 1.05, longitude: -76.616 })).rejects.toMatchObject({ code: 'NO_COVERAGE' });
    await expect(quote.execute({ establishmentId: 'nope', latitude: 1.03, longitude: -76.616 })).rejects.toMatchObject({ code: 'ESTABLISHMENT_NOT_FOUND' });
  });

  it('el personal de otro municipio no ve ni toca la zona', async () => {
    const { manageZones, municipalities } = setup();
    municipalities.rows.push({ id: 2, name: 'Mocoa', department: 'Putumayo', timeZone: 'America/Bogota', center: { lat: 1.15, lng: -76.65 }, launched: true });
    const created = await manageZones.create(admin, zone({ municipalityId: 1 }));
    await expect(manageZones.deactivate(scopedAdmin(2), created.id)).rejects.toMatchObject({ code: 'ZONE_NOT_FOUND' });
    await expect(manageZones.list(scopedAdmin(2), 1)).rejects.toMatchObject({ code: 'MUNICIPALITY_NOT_FOUND' });
    // Con dos municipios lanzados, el administrador global debe elegir.
    await expect(manageZones.list(admin)).rejects.toMatchObject({ code: 'MUNICIPALITY_REQUIRED' });
  });
});

describe('Horario de operación (H03.2)', () => {
  // Lunes 19 de octubre de 2026, 7:00 a. m. en Bogotá.
  const monday7am = new Date('2026-10-19T12:00:00Z');

  it('guarda la semana y calcula la próxima apertura; la regla de pedidos la respeta', async () => {
    const { manageSchedule, status, ensureOpen } = setup();
    const view = await manageSchedule.setWeekly(admin, undefined, [
      { weekday: 1, slots: [{ opensAt: '16:00', closesAt: '22:00' }, { opensAt: '08:00', closesAt: '14:00' }] },
      { weekday: 2, slots: [{ opensAt: '08:00', closesAt: '14:00' }] },
    ]);
    expect(view.weekly[1].slots.map((s) => s.toJSON().opensAt)).toEqual(['08:00', '16:00']);
    expect(view.weekly[0].slots).toEqual([]);

    const { state } = await status.execute(undefined, monday7am);
    expect(state).toEqual({ open: false, closesAt: null, nextOpeningAt: new Date('2026-10-19T13:00:00Z') });
    await expect(ensureOpen.execute(1, monday7am)).rejects.toMatchObject({
      code: 'OUTSIDE_OPERATING_HOURS',
      details: { nextOpeningAt: '2026-10-19T13:00:00.000Z' },
    });
    await expect(ensureOpen.execute(1, new Date('2026-10-19T14:00:00Z'))).resolves.toBeUndefined();
  });

  it('rechaza días repetidos, franjas que se cruzan y fechas especiales pasadas', async () => {
    const { manageSchedule } = setup();
    await expect(
      manageSchedule.setWeekly(admin, undefined, [
        { weekday: 1, slots: [] },
        { weekday: 1, slots: [] },
      ]),
    ).rejects.toMatchObject({ code: 'INVALID_TIME_SLOT' });
    await expect(
      manageSchedule.setWeekly(admin, undefined, [{ weekday: 3, slots: [{ opensAt: '08:00', closesAt: '14:00' }, { opensAt: '12:00', closesAt: '18:00' }] }]),
    ).rejects.toMatchObject({ code: 'OVERLAPPING_TIME_SLOTS', details: { weekday: 3 } });
    await expect(manageSchedule.setException(admin, undefined, { date: '2026-10-18', closed: true }, monday7am)).rejects.toMatchObject({ code: 'DATE_IN_PAST' });
    await expect(manageSchedule.setException(admin, undefined, { date: '2026-02-30', closed: true }, monday7am)).rejects.toMatchObject({ code: 'INVALID_DATE' });
  });

  it('un festivo cerrado manda sobre la semana', async () => {
    const { manageSchedule, status } = setup();
    await manageSchedule.setWeekly(admin, undefined, [1, 2].map((weekday) => ({ weekday, slots: [{ opensAt: '08:00', closesAt: '14:00' }] })));
    const view = await manageSchedule.setException(admin, undefined, { date: '2026-10-19', closed: true, reason: ' Festivo ' }, monday7am);
    expect(view.exceptions).toEqual([{ date: '2026-10-19', slots: [], reason: 'Festivo' }]);
    const { state } = await status.execute(undefined, monday7am);
    expect(state.nextOpeningAt).toEqual(new Date('2026-10-20T13:00:00Z'));
  });
});

describe('Parámetros y comisión (H03.3)', () => {
  it('valida el rango, registra la versión e invalida la caché solo si el valor cambió', async () => {
    const { manageSettings, settings, reader } = setup();
    await expect(manageSettings.change(admin, { key: 'offers.timeout_seconds', value: '5', scope: 'GLOBAL' })).rejects.toMatchObject({ code: 'INVALID_SETTING_VALUE' });
    await manageSettings.change(admin, { key: 'offers.timeout_seconds', value: '60', scope: 'GLOBAL' });
    expect(settings.values).toHaveLength(2);
    const record = await manageSettings.change(admin, { key: 'offers.timeout_seconds', value: '90', scope: 'GLOBAL' });
    expect(record.global).toMatchObject({ value: '90', createdBy: 'admin-1' });
    expect(record.defaultValue).toBe('60');
    expect(reader.invalidate).toHaveBeenCalledTimes(1);
  });

  it('valor por municipio solo en parámetros que lo admiten; el administrador con alcance no toca el global', async () => {
    const { manageSettings, settings } = setup();
    await expect(manageSettings.change(admin, { key: 'otp.max_attempts', value: '3', scope: 'MUNICIPALITY' })).rejects.toMatchObject({ code: 'SETTING_NOT_SCOPED' });
    await manageSettings.change(scopedAdmin(1), { key: 'offers.timeout_seconds', value: '120', scope: 'GLOBAL' });
    expect(settings.values.at(-1)).toMatchObject({ municipalityId: 1, value: '120' });
    await expect(manageSettings.change(admin, { key: 'nope', value: '1', scope: 'GLOBAL' })).rejects.toMatchObject({ code: 'SETTING_NOT_FOUND' });
  });

  it('la comisión se guarda como versión nueva solo si cambia', async () => {
    const { commission, settings } = setup();
    await expect(commission.change(admin, { percent: '100' })).rejects.toMatchObject({ code: 'INVALID_COMMISSION' });
    await commission.change(admin, { percent: '15' });
    await commission.change(admin, { percent: '15,00' });
    const view = await commission.change(admin, { percent: '12.5' });
    expect(settings.commissions.map((c) => c.rate)).toEqual(['0.1500', '0.1250']);
    expect(view.current?.rate).toBe('0.1250');
  });
});
