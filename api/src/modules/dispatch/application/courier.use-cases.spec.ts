import { Notifier } from '../../notifications/application/notifier';
import { DomainError } from '../../../shared/domain/domain.error';
import { courierPrincipal, MemoryCourierDesk } from '../../../../test/dispatch/fakes';
import { CourierAvailabilityUseCase, CourierOffersUseCase } from './courier.use-cases';

const codeOf = async (work: Promise<unknown>) => ((await work.then(() => null, (e: DomainError) => e)) as DomainError | null)?.code;

describe('CourierAvailabilityUseCase', () => {
  it('se activa verificado y con la autorización de ubicación aceptada', async () => {
    const desk = new MemoryCourierDesk();
    const status = await new CourierAvailabilityUseCase(desk).setAvailable(courierPrincipal, true);
    expect(status.availableSince).not.toBeNull();
  });

  it('sin verificar o sin autorización no se activa; desactivarse siempre se puede', async () => {
    const desk = new MemoryCourierDesk();
    const useCase = new CourierAvailabilityUseCase(desk);
    desk.current = { ...desk.current!, locationConsentPending: true };
    expect(await codeOf(useCase.setAvailable(courierPrincipal, true))).toBe('LOCATION_CONSENT_REQUIRED');
    desk.current = { ...desk.current!, verified: false };
    expect(await codeOf(useCase.setAvailable(courierPrincipal, true))).toBe('COURIER_NOT_VERIFIED');
    await useCase.setAvailable(courierPrincipal, false);
    expect(desk.closedWith).toBe('TOGGLED_OFF');
  });

  it('guarda ubicaciones solo con Disponible o pedido en curso, y descarta horas del futuro', async () => {
    const desk = new MemoryCourierDesk();
    const useCase = new CourierAvailabilityUseCase(desk);
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
