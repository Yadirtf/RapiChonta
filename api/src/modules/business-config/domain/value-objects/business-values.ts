import { BusinessErrors } from '../business-config.errors';
import { SETTING_DATA_TYPES, SettingDataTypeCode } from '../business-config.codes';

/**
 * Decimal exacto como entero escalado: "12,5" con 2 decimales → 1250n. El dinero y los porcentajes
 * nunca pasan por un número de punto flotante (RNF-05).
 */
function scaled(value: string | number, decimals: number): bigint | null {
  const text = (typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value ?? '')).trim().replace(',', '.');
  const fraction = decimals > 0 ? `(?:\\.(\\d{1,${decimals}}))?` : '';
  const match = new RegExp(`^(-?)(\\d{1,12})${fraction}$`).exec(text);
  if (!match) return null;
  const magnitude = BigInt(match[2]) * 10n ** BigInt(decimals) + BigInt((match[3] ?? '').padEnd(decimals, '0') || '0');
  return match[1] ? -magnitude : magnitude;
}

function unscaled(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const fraction = decimals ? `.${(abs % unit).toString().padStart(decimals, '0')}` : '';
  return `${negative ? '-' : ''}${abs / unit}${fraction}`;
}

/**
 * Porcentaje de comisión (RF-73): se escribe en porcentaje con hasta 2 decimales ("12,5 %") y se guarda
 * como tasa numeric(5,4) ("0.1250"), entre 0 y menos de 1 (CHECK de commission_rates).
 */
export class CommissionPercent {
  private constructor(private readonly hundredths: bigint) {}

  static parse(value: string | number): CommissionPercent {
    const hundredths = scaled(value, 2);
    if (hundredths === null || hundredths < 0n || hundredths >= 10_000n) throw BusinessErrors.invalidCommission();
    return new CommissionPercent(hundredths);
  }

  /** "0.1250" desde la base → 12.50 %. */
  static fromRate(rate: string): CommissionPercent {
    const tenThousandths = scaled(rate, 4);
    if (tenThousandths === null) throw BusinessErrors.invalidCommission();
    return new CommissionPercent(tenThousandths);
  }

  toRate(): string {
    return unscaled(this.hundredths, 4);
  }

  /** "12.50" */
  toPercentString(): string {
    return unscaled(this.hundredths, 2);
  }

  equals(other: CommissionPercent): boolean {
    return this.hundredths === other.hundredths;
  }
}

/**
 * Valor de un parámetro del negocio (RF-16). Todos los tipos actuales son cantidades enteras (unidades,
 * pesos, segundos, metros, días); el rango viene de setting_definitions.
 */
export function parseSettingValue(type: SettingDataTypeCode, value: string | number, min: string | null, max: string | null): string {
  const parsed = scaled(value, 0);
  const integral = Object.values(SETTING_DATA_TYPES).includes(type);
  const lower = min !== null ? scaled(min, 4) : null;
  const upper = max !== null ? scaled(max, 4) : null;
  const asTenThousandths = parsed === null ? null : parsed * 10_000n;
  if (
    !integral ||
    asTenThousandths === null ||
    asTenThousandths < 0n ||
    (lower !== null && asTenThousandths < lower) ||
    (upper !== null && asTenThousandths > upper)
  ) {
    throw BusinessErrors.invalidSettingValue(min !== null ? trimDecimal(min) : null, max !== null ? trimDecimal(max) : null);
  }
  return unscaled(parsed!, 0);
}

/** "100000.0000" → "100000"; "0.5000" → "0.5". */
export function trimDecimal(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}
