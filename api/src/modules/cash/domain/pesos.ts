const AMOUNT = /^-?(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

/**
 * Pesos exactos con signo (RNF-05): centavos en `bigint`, nunca punto flotante. La base guarda numeric(12,2) y la API
 * habla en texto decimal ("12000.00", "-1500.00"). El libro de caja suma con signo, por eso no sirve `Price`.
 */
export class Pesos {
  private constructor(private readonly cents: bigint) {}

  static readonly ZERO = new Pesos(0n);

  /** Texto decimal con hasta dos cifras; null si no es un monto. */
  static parse(text: string): Pesos | null {
    const value = text.trim();
    if (!AMOUNT.test(value)) return null;
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = value.replace('-', '').split('.');
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    return new Pesos(negative ? -cents : cents);
  }

  /** Lo que llega de la base (numeric como texto): siempre válido, o es un error de programación. */
  static of(text: string): Pesos {
    const value = Pesos.parse(text);
    if (!value) throw new Error(`Monto inválido: ${text}`);
    return value;
  }

  static sum(values: Iterable<Pesos>): Pesos {
    let cents = 0n;
    for (const v of values) cents += v.cents;
    return new Pesos(cents);
  }

  plus(other: Pesos): Pesos {
    return new Pesos(this.cents + other.cents);
  }

  minus(other: Pesos): Pesos {
    return new Pesos(this.cents - other.cents);
  }

  /** El sentido del tipo de movimiento: +1 o −1. */
  times(direction: 1 | -1): Pesos {
    return new Pesos(this.cents * BigInt(direction));
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  isPositive(): boolean {
    return this.cents > 0n;
  }

  equals(other: Pesos): boolean {
    return this.cents === other.cents;
  }

  toString(): string {
    const abs = this.cents < 0n ? -this.cents : this.cents;
    return `${this.cents < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  }
}
