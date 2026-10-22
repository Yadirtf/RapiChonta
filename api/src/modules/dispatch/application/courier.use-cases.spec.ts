import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { GeofenceUseCase } from '../../fulfillment/application/courier-trip.use-cases';
import { Notifier } from '../../notifications/application/notifier';
import { DomainError } from '../../../shared/domain/domain.error';
import { courierPrincipal, MemoryCourierDesk } from '../../../../test/dispatch/fakes';
import { CourierAvailabilityUseCase, CourierOffersUseCase } from './courier.use-cases';

const geofence = (arrival: { orderCode: string; status: string } | null = null) =>
  ({ evaluate: jest.fn().mockResolvedValue(arrival) }) as unknown as GeofenceUseCase & { evaluate: jest.Mock };

const codeOf = async (work: Promise<unknown>) => ((await work.then(() => null, (e: DomainError) => e)) as DomainError | null)?.code;

describe('CourierAvailabilityUseCase', () => {
  it('se activa verificado y con la autorización de ubicación aceptada', async () => {
    const desk = new MemoryCourierDesk();
    const status = await new CourierAvailabilityUseCase(desk, geofence()).setAvailable(courierPrincipal, true);
    expect(status.availableSince).not.toBeNull();
  });

  it('sin verificar, sin autorización o en un municipio que no opera no se activa; desactivarse siempre se puede', async () => {
    const desk = new MemoryCourierDesk();
    const useCase = new CourierAvailabilityUseCase(desk, geofence());
    desk.current = { ...desk.current!, municipality: { id: 2, name: 'Colón', launched: false } };
    expect(await codeOf(useCase.setAvailable(courierPrincipal, true))).toBe('COURIER_MUNICIPALITY_NOT_OPERATING');
    desk.current = { ...desk.current!, municipality: null };
    expect(await codeOf(useCase.setAvailable(courierPrincipal, true))).toBe('COURIER_MUNICIPALITY_NOT_OPERATING');
    desk.current = { ...desk.current!, locationConsentPending: true };
    expect(await codeOf(useCase.setAvailable(courierPrincipal, true))).toBe('LOCATION_CONSENT_REQUIRED');
    desk.current = { ...desk.current!, verified: false };
    expect(await codeOf(useCase.setAvailable(courierPrincipal, true))).toBe('COURIER_NOT_VERIFIED');
    await useCase.setAvailable(courierPrincipal, false);
    expect(desk.closedWith).toBe('TOGGLED_OFF');
  });

  it('guarda ubicaciones solo con Disponible o pedido en curso, y descarta horas del futuro', async () => {
    const desk = new MemoryCourierDesk();
    const useCase = new CourierAvailabilityUseCase(desk, geofence());
    const now = new Date('2026-10-21T12:00:00Z');
    const result = await useCase.reportLocations(
      courierPrincipal,
      [
        { latitude: 1.03, longitude: -76.61, accuracyM: 8, recordedAt: new Date('2026-10-21T11:59:55Z') },
        { latitude: 1.03, longitude: -76.61, recordedAt: new Date('2026-10-21T12:10:00Z') },
      ],
      now,
    );
    expect(result.accepted).toBe(1);
    expect(desk.recorded[0].accuracyM).toBe(8);
    desk.expecting = false;
    expect(await codeOf(useCase.reportLocations(courierPrincipal, [{ latitude: 1, longitude: -76, recordedAt: now }], now))).toBe('LOCATION_NOT_EXPECTED');
  });

  it('corrige la hora de un teléfono con el reloj mal puesto usando la hora de envío', async () => {
    const desk = new MemoryCourierDesk();
    const useCase = new CourierAvailabilityUseCase(desk, geofence());
    const now = new Date('2026-10-21T12:00:00Z');
    // Reloj 5 horas atrasado (hora local tomada como UTC): sin corregir, el panel la vería vieja.
    const behind = await useCase.reportLocations(
      courierPrincipal,
      [
        { latitude: 1.03, longitude: -76.61, recordedAt: new Date('2026-10-21T06:59:50Z') },
        { latitude: 1.03, longitude: -76.61, recordedAt: new Date('2026-10-21T06:59:58Z') },
      ],
      now,
      new Date('2026-10-21T07:00:00Z'),
    );
    expect(behind.accepted).toBe(2);
    expect(desk.recorded.map((r) => r.recordedAt.toISOString())).toEqual(['2026-10-21T11:59:50.000Z', '2026-10-21T11:59:58.000Z']);
    // Adelantado: sin corregir se descartaría como "del futuro".
    desk.recorded = [];
    desk.last = null;
    const ahead = await useCase.reportLocations(
      courierPrincipal,
      [{ latitude: 1.03, longitude: -76.61, recordedAt: new Date('2026-10-21T16:59:55Z') }],
      now,
      new Date('2026-10-21T17:00:00Z'),
    );
    expect(ahead.accepted).toBe(1);
    expect(desk.recorded[0].recordedAt.toISOString()).toBe('2026-10-21T11:59:55.000Z');
  });

  it('el estado dice si la ubicación le está llegando al panel', async () => {
    const desk = new MemoryCourierDesk();
    const useCase = new CourierAvailabilityUseCase(desk, geofence());
    const now = new Date('2026-10-21T12:00:00Z');
    expect((await useCase.status(courierPrincipal, now)).locationFresh).toBe(false);
    desk.current = { ...desk.current!, lastLocationAt: new Date('2026-10-21T11:59:00Z') };
    expect((await useCase.status(courierPrincipal, now)).locationFresh).toBe(true);
    desk.current = { ...desk.current!, lastLocationAt: new Date('2026-10-21T11:57:00Z') };
    expect((await useCase.status(courierPrincipal, now)).locationFresh).toBe(false);
  });

  it('descarta lecturas simuladas y saltos imposibles; con lecturas válidas revisa las geocercas', async () => {
    const desk = new MemoryCourierDesk();
    const probe = geofence({ orderCode: 'RC-7K3M', status: 'AT_ESTABLISHMENT' });
    const useCase = new CourierAvailabilityUseCase(desk, probe);
    const now = new Date('2026-10-21T12:00:00Z');
    desk.last = { location: GeoPoint.create(1.0306, -76.6158), accuracyM: 6, recordedAt: new Date('2026-10-21T11:59:50Z') };
    const result = await useCase.reportLocations(
      courierPrincipal,
      [
        // 20 m en 5 s: normal en moto.
        { latitude: 1.0308, longitude: -76.6158, accuracyM: 6, recordedAt: new Date('2026-10-21T11:59:55Z') },
        // Bogotá 5 s después: GPS simulado.
        { latitude: 4.711, longitude: -74.0721, accuracyM: 5, recordedAt: new Date('2026-10-21T11:59:58Z') },
        // Marcada por Android como simulada.
        { latitude: 1.0309, longitude: -76.6158, accuracyM: 5, recordedAt: new Date('2026-10-21T11:59:59Z'), mocked: true },
      ],
      now,
    );
    expect(result).toEqual({ accepted: 1, arrival: { orderCode: 'RC-7K3M', status: 'AT_ESTABLISHMENT' } });
    expect(desk.recorded).toHaveLength(1);
    expect(probe.evaluate).toHaveBeenCalledWith(courierPrincipal.userId);
  });

  it('sin lecturas válidas no guarda nada ni revisa geocercas', async () => {
    const desk = new MemoryCourierDesk();
    const probe = geofence();
    const now = new Date('2026-10-21T12:00:00Z');
    const result = await new CourierAvailabilityUseCase(desk, probe).reportLocations(
      courierPrincipal,
      [{ latitude: 1.03, longitude: -76.61, recordedAt: now, mocked: true }],
      now,
    );
    expect(result).toEqual({ accepted: 0, arrival: null });
    expect(probe.evaluate).not.toHaveBeenCalled();
  });
});

describe('CourierOffersUseCase', () => {
  it('aceptar avisa al instante; si otro lo tomó, "Ya fue tomado"', async () => {
    const desk = new MemoryCourierDesk();
    const notifier = { kick: jest.fn() };
    const useCase = new CourierOffersUseCase(desk, notifier as unknown as Notifier);
    expect(await useCase.accept(courierPrincipal, 'oferta-1')).toEqual({ orderCode: 'RC-7K3M' });
    expect(notifier.kick).toHaveBeenCalledTimes(1);
    desk.result = { ok: false, reason: 'TAKEN' };
    expect(await codeOf(useCase.accept(courierPrincipal, 'oferta-1'))).toBe('ORDER_ALREADY_TAKEN');
    desk.result = { ok: false, reason: 'EXPIRED' };
    expect(await codeOf(useCase.reject(courierPrincipal, 'oferta-1'))).toBe('OFFER_EXPIRED');
  });
});
