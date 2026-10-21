const DECIMAL = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Pesos en centavos enteros (RNF-05). La base guarda numeric(12,2) y la API devuelve texto decimal
 * ("12000.00"); en memoria se suma en centavos para no pasar nunca por punto flotante.
 */
export const Money = {
  toCents(decimal: string): number {
    const text = decimal.trim();
    if (!DECIMAL.test(text)) throw new Error(`Monto inválido: ${decimal}`);
    const [whole, fraction = ''] = text.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  },

  toDecimal(cents: number): string {
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Centavos inválidos: ${cents}`);
    return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
  },
};
