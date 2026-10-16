import { IdentityErrors } from '../identity.errors';

const MIN_LENGTH = 10;
const MAX_LENGTH = 128;
const COMMON = new Set(['1234567890', '0123456789', 'contraseña', 'contrasena', 'password12', 'rapichonta', 'qwertyuiop']);

/**
 * Política de contraseña del personal y de los domiciliarios (OWASP ASVS 2.1): longitud mínima de 10,
 * sin reglas de composición forzadas, pero rechazando claves triviales (repetidas, secuencias, comunes).
 */
export class Password {
  private constructor(readonly value: string) {}

  static create(raw: string): Password {
    const value = raw ?? '';
    const normalized = value.toLowerCase();
    const trivial = /^(.)\1+$/.test(value) || COMMON.has(normalized) || /^\d+$/.test(value);
    if (value.length < MIN_LENGTH || value.length > MAX_LENGTH || trivial) throw IdentityErrors.weakPassword();
    return new Password(value);
  }
}
