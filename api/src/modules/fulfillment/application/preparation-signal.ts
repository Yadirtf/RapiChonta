/** Despierta al reloj de preparación (compra registrada o "Sigue en preparación"). Lo implementa infrastructure/preparation-clock.ts. */
export abstract class PreparationSignal {
  abstract reschedule(): void;
}
