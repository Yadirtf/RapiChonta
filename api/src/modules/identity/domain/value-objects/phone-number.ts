import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { IdentityErrors } from '../identity.errors';

/**
 * Número de celular en formato E.164 (RF-01). Acepta números colombianos sin prefijo (300 123 4567)
 * e internacionales con "+". Solo se aceptan móviles: el código llega por SMS o WhatsApp.
 */
export class PhoneNumber {
  private constructor(readonly e164: string) {}

  static parse(raw: string, defaultCountry: CountryCode = 'CO'): PhoneNumber {
    const parsed = parsePhoneNumberFromString(raw?.trim() ?? '', defaultCountry);
    if (!parsed || !parsed.isValid()) throw IdentityErrors.invalidPhone();
    const type = parsed.getType();
    if (type && type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') throw IdentityErrors.invalidPhone();
    return new PhoneNumber(parsed.number);
  }

  /** Para reconstruir desde la base de datos, donde ya está validado. */
  static fromTrusted(e164: string): PhoneNumber {
    return new PhoneNumber(e164);
  }

  /** "+57 •••• ••45 67": lo que se muestra al pedir el código, sin exponer el número completo. */
  get masked(): string {
    const digits = this.e164.slice(1);
    const visible = digits.slice(-4);
    const prefix = this.e164.startsWith('+57') ? '+57' : `+${digits.slice(0, Math.max(1, digits.length - 10))}`;
    return `${prefix} ••• ••• ${visible}`;
  }

  equals(other: PhoneNumber): boolean {
    return other.e164 === this.e164;
  }
}
