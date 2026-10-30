import { assertPreparationMinutes, laneOf, sortCounter, suggestedMinutes } from './merchant-orders';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 30, 12, minutes));
const order = (over: Partial<Parameters<typeof laneOf>[0]> & { code: string; createdAt?: Date; estimatedReadyAt?: Date | null; closedAt?: Date | null }) => ({
  status: 'PENDING_ASSIGNMENT',
  terminal: false,
  acceptedAt: null,
  readyAt: null,
  pickedUpAt: null,
  createdAt: at(0),
  estimatedReadyAt: null,
  closedAt: null,
  ...over,
});

describe('Mostrador del comercio aliado (H15.1)', () => {
  it('el tiempo prometido es un entero de 1 a 240 minutos', () => {
    expect(assertPreparationMinutes(20)).toBe(20);
    for (const bad of [0, 241, 12.5, Number.NaN]) {
      expect(() => assertPreparationMinutes(bad)).toThrow(expect.objectContaining({ code: 'PREPARATION_MINUTES_INVALID' }));
    }
  });

  it('sugiere lo que tarda el producto más lento, con 15 si el menú no lo dice', () => {
    expect(suggestedMinutes([{ prepMinutes: 10 }, { prepMinutes: 35 }])).toBe(35);
    expect(suggestedMinutes([{ prepMinutes: 0 }])).toBe(15);
    expect(suggestedMinutes([{ prepMinutes: 500 }])).toBe(240);
  });

  it('cada pedido va en su columna: por aceptar, preparando, listo o cerrado', () => {
    expect(laneOf(order({ code: 'a', status: 'AWAITING_MERCHANT' }))).toBe('INCOMING');
    expect(laneOf(order({ code: 'b', acceptedAt: at(1) }))).toBe('PREPARING');
    expect(laneOf(order({ code: 'c', acceptedAt: at(1), readyAt: at(9) }))).toBe('READY');
    // Recogido: aunque siga en curso para el cliente, en el local ya está cerrado.
    expect(laneOf(order({ code: 'd', status: 'ON_THE_WAY', readyAt: at(9), pickedUpAt: at(12) }))).toBe('CLOSED');
    expect(laneOf(order({ code: 'e', status: 'CANCELLED', terminal: true }))).toBe('CLOSED');
  });

  it('lo más urgente primero: lo que espera por antigüedad, lo que se prepara por la hora prometida', () => {
    const sorted = sortCounter([
      order({ code: 'closed-old', status: 'CANCELLED', terminal: true, closedAt: at(1) }),
      order({ code: 'prep-late', acceptedAt: at(0), estimatedReadyAt: at(40) }),
      order({ code: 'new-2', status: 'AWAITING_MERCHANT', createdAt: at(5) }),
      order({ code: 'ready', acceptedAt: at(0), readyAt: at(20) }),
      order({ code: 'prep-soon', acceptedAt: at(0), estimatedReadyAt: at(25) }),
      order({ code: 'new-1', status: 'AWAITING_MERCHANT', createdAt: at(2) }),
      order({ code: 'closed-new', status: 'DELIVERED', terminal: true, closedAt: at(30) }),
    ]);
    expect(sorted.map((o) => o.code)).toEqual(['new-1', 'new-2', 'prep-soon', 'prep-late', 'ready', 'closed-new', 'closed-old']);
  });
});
