import { DomainError } from '../../../shared/domain/domain.error';
import { nextSweepDelay, OfferCandidate, planRecipients, responseError } from './offer-plan';

const candidate = (userId: string, extra: Partial<OfferCandidate> = {}): OfferCandidate => ({ userId, hasPendingOffer: false, declined: false, ...extra });
const code = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return (error as DomainError).code;
  }
  return null;
};

describe('planRecipients', () => {
  const pool = [candidate('ana'), candidate('beto', { declined: true }), candidate('caro', { hasPendingOffer: true })];

  it('a uno: el elegido, aunque haya rechazado antes', () => {
    expect(planRecipients('SPECIFIC', pool, 'beto')).toEqual(['beto']);
  });

  it('a uno: exige elegir, que esté disponible y que no lo tenga ya en pantalla', () => {
    expect(code(() => planRecipients('SPECIFIC', pool))).toBe('COURIER_REQUIRED');
    expect(code(() => planRecipients('SPECIFIC', pool, 'dario'))).toBe('COURIER_NOT_AVAILABLE');
    expect(code(() => planRecipients('SPECIFIC', pool, 'caro'))).toBe('OFFER_ALREADY_PENDING');
  });

  it('a todos: deja fuera a quien ya lo tiene o lo rechazó', () => {
    expect(planRecipients('BROADCAST', pool)).toEqual(['ana']);
  });

  it('a todos sin nadie libre: no hay domiciliarios', () => {
    expect(code(() => planRecipients('BROADCAST', []))).toBe('NO_COURIERS_AVAILABLE');
    expect(code(() => planRecipients('BROADCAST', [candidate('beto', { declined: true })]))).toBe('NO_COURIERS_AVAILABLE');
  });
});

describe('responseError', () => {
  it('cada motivo tiene su código para la app', () => {
    expect(['NOT_FOUND', 'TAKEN', 'EXPIRED', 'CLOSED', 'BUSY'].map((r) => responseError(r as never).code)).toEqual([
      'OFFER_NOT_FOUND',
      'ORDER_ALREADY_TAKEN',
      'OFFER_EXPIRED',
      'OFFER_CLOSED',
      'COURIER_BUSY',
    ]);
  });
});

describe('nextSweepDelay', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const options = { idleMs: 300_000, graceMs: 250, minMs: 1_000 };

  it('sin ofertas vivas: la revisión de respaldo', () => {
    expect(nextSweepDelay(null, now, options)).toBe(300_000);
  });

  it('justo después del próximo vencimiento, nunca antes del mínimo ni después del respaldo', () => {
    expect(nextSweepDelay(new Date('2026-10-21T12:00:40Z'), now, options)).toBe(40_250);
    expect(nextSweepDelay(new Date('2026-10-21T11:59:00Z'), now, options)).toBe(1_000);
    expect(nextSweepDelay(new Date('2026-10-21T13:00:00Z'), now, options)).toBe(300_000);
  });
});
