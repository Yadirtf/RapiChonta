/** Despierta al reloj del despacho para que mire la oferta recién creada. Lo implementa infrastructure/dispatch-clock.ts. */
export abstract class DispatchSignal {
  abstract reschedule(): void;
}
