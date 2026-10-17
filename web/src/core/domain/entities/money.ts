/**
 * Dinero en centavos enteros. La API manda precios como texto decimal ("12000.50"); sumarlos como
 * números de punto flotante acumula errores, así que se convierten a centavos antes de operar.
 */
export function toCents(decimal: string): number {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(decimal.trim());
  if (!match) return NaN;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export const fromCents = (cents: number) => `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

/** Lo que escribe una persona en el panel ("12.000", "12000,5", "$ 12 000") → "12000.50"; null si no es un precio. */
export function parsePriceInput(input: string): string | null {
  const clean = input.replace(/[\s$]/g, "");
  if (!clean) return null;
  // En Colombia el punto separa miles y la coma decimales; se acepta también "12000.50".
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  const integer = match[1].replace(/\./g, "");
  if (integer.length > 10) return null;
  return `${Number(integer)}.${(match[2] ?? "").padEnd(2, "0")}`;
}
