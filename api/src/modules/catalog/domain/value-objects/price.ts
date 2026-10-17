import { CatalogErrors } from '../catalog.errors';

const PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Precio en pesos colombianos (RNF-05): numeric(12,2) en la base, centavos enteros en memoria y texto
 * decimal ("12000.00") en la API. Nunca pasa por un número de punto flotante.
 */
export class Price {
  private constructor(private readonly cents: bigint) {}

  static parse(value: string | number): Price {
    const text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value.trim();
    if (!PATTERN.test(text)) throw CatalogErrors.invalidPrice();
    const [whole, fraction = ''] = text.split('.');
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (cents <= 0n) throw CatalogErrors.invalidPrice();
    return new Price(cents);
  }

  /** "12000.00": lo que se guarda en numeric(12,2) y lo que devuelve la API. */
  toDecimalString(): string {
    const whole = this.cents / 100n;
    const fraction = (this.cents % 100n).toString().padStart(2, '0');
    return `${whole}.${fraction}`;
  }

  equals(other: Price): boolean {
    return this.cents === other.cents;
  }
}

export const PREP_MINUTES = { min: 0, max: 240 } as const;

export function assertPrepMinutes(value: number): number {
  if (!Number.isInteger(value) || value < PREP_MINUTES.min || value > PREP_MINUTES.max) throw CatalogErrors.invalidPrepMinutes();
  return value;
}
