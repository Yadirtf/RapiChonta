import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Firma HMAC-SHA256 de datos cortos (permiso de subida, URL de lectura). Sin estado en la base:
 * quien tiene el texto firmado y no vencido puede hacer exactamente lo que dice, y nada más.
 */
export class Signer {
  constructor(private readonly secret: string) {}

  sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  verify(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  /** `<payload base64url>.<firma>` */
  seal(data: object): string {
    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  open<T>(token: string): T | null {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined || !this.verify(payload, signature)) return null;
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T;
    } catch {
      return null;
    }
  }
}

/** Vencimiento en ventanas fijas: la misma foto conserva la misma URL un buen rato y el navegador la guarda en caché. */
export function bucketedExpiry(now: Date, windowSeconds: number): Date {
  const window = windowSeconds * 1000;
  return new Date(Math.ceil(now.getTime() / window) * window + window);
}
