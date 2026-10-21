import { randomInt } from 'node:crypto';

/** Base32 de Crockford: sin I, L, O ni U, para dictarlo por teléfono sin confusiones ("RC-7K3M"). */
export const ORDER_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ORDER_CODE_PATTERN = /^RC-[0-9A-HJKMNP-TV-Z]{4,8}$/;

/**
 * Código visible del pedido. Empieza con 4 caracteres (≈ 1 millón de combinaciones); si choca, el caso de
 * uso reintenta y a partir del tercer intento usa uno más. Subir el largo no requiere migrar (CHECK hasta 8).
 */
export const OrderCode = {
  generate(attempt = 0, random: (max: number) => number = randomInt): string {
    const length = attempt < 3 ? 4 : Math.min(8, 2 + attempt);
    let code = 'RC-';
    for (let i = 0; i < length; i++) code += ORDER_CODE_ALPHABET[random(ORDER_CODE_ALPHABET.length)];
    return code;
  },

  /** Lo que escribe el cliente al buscar ("rc 7k3m", "7K3M") en la forma guardada, o null. */
  normalize(raw: string): string | null {
    const compact = (raw ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/^RC/, '');
    const code = `RC-${compact}`;
    return ORDER_CODE_PATTERN.test(code) ? code : null;
  },
};
