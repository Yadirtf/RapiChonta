/**
 * E09 · Producto faltante o con otro precio (Docs/14-base-de-datos/E09-producto-faltante.md). El domiciliario
 * consulta una o varias líneas a la vez; el cliente decide cada una con opciones cerradas. Lo que hace cada
 * decisión vive en el catálogo adjustment_decisions (quita la línea, usa el precio nuevo, crea sustituta, cancela);
 * aquí solo se nombran los códigos que el programa elige él mismo.
 */
export const ADJUSTMENT_REASONS = {
  UNAVAILABLE: 'UNAVAILABLE',
  PRICE_CHANGED: 'PRICE_CHANGED',
} as const;
export type AdjustmentReasonCode = (typeof ADJUSTMENT_REASONS)[keyof typeof ADJUSTMENT_REASONS];

export const ADJUSTMENT_DECISIONS = {
  SUBSTITUTE: 'SUBSTITUTE',
  REMOVE_ITEM: 'REMOVE_ITEM',
  ACCEPT_PRICE: 'ACCEPT_PRICE',
  CANCEL_ORDER: 'CANCEL_ORDER',
  /** La que toma el sistema al vencer el plazo. */
  EXPIRED_REMOVED: 'EXPIRED_REMOVED',
} as const;
export type AdjustmentDecisionCode = (typeof ADJUSTMENT_DECISIONS)[keyof typeof ADJUSTMENT_DECISIONS];

export const CANCELLATION_REASONS = {
  CUSTOMER_REQUEST: 'CUSTOMER_REQUEST',
  ALL_ITEMS_UNAVAILABLE: 'ALL_ITEMS_UNAVAILABLE',
} as const;
export type CancellationReasonCode = (typeof CANCELLATION_REASONS)[keyof typeof CANCELLATION_REASONS];

export const ADJUSTMENT_SETTINGS = { TIMEOUT_SECONDS: 'adjustments.timeout_seconds' } as const;
/** Si el municipio no tiene el valor (el mismo de la semilla): 3 minutos, porque el domiciliario está esperando. */
export const DEFAULT_ADJUSTMENT_TIMEOUT_SECONDS = 180;
/** Una consulta no tiene más líneas que un pedido (order_items.quantity va de 1 a 99; las líneas, pocas). */
export const MAX_REPORTED_LINES = 30;
/** Cuántos productos se sugieren para cambiar. */
export const MAX_SUBSTITUTES = 24;

export const ADJUSTMENT_NOTICES = { REQUESTED: 'ADJUSTMENT_REQUESTED', RESOLVED: 'ADJUSTMENT_RESOLVED' } as const;

/** Pesos con hasta dos decimales; tope de 10 dígitos enteros (numeric(12,2)). */
const PRICE = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export interface ReportedLine {
  orderItemId: string;
  reason: AdjustmentReasonCode;
  /** Solo con PRICE_CHANGED: el precio unitario que pide ahora el local. */
  unitPrice?: string | null;
}

export type ReportProblem = 'EMPTY' | 'TOO_MANY' | 'DUPLICATED' | 'PRICE_REQUIRED' | 'PRICE_NOT_ALLOWED' | 'PRICE_INVALID' | 'PRICE_UNCHANGED';

/**
 * Lo que el domiciliario manda antes de tocar la base: al menos una línea, cada una una sola vez, y el precio solo
 * con "cambió de precio" (positivo y distinto del que tenía la línea). `currentPrices` es el precio actual por línea.
 */
export function reportProblem(lines: readonly ReportedLine[], currentPrices: ReadonlyMap<string, string>): ReportProblem | null {
  if (lines.length === 0) return 'EMPTY';
  if (lines.length > MAX_REPORTED_LINES) return 'TOO_MANY';
  if (new Set(lines.map((l) => l.orderItemId)).size !== lines.length) return 'DUPLICATED';
  for (const line of lines) {
    const price = line.unitPrice ?? null;
    if (line.reason === ADJUSTMENT_REASONS.PRICE_CHANGED) {
      if (price === null || price === '') return 'PRICE_REQUIRED';
      if (!PRICE.test(price) || Number(price) <= 0) return 'PRICE_INVALID';
      const current = currentPrices.get(line.orderItemId);
      if (current !== undefined && Number(current) === Number(price)) return 'PRICE_UNCHANGED';
    } else if (price !== null && price !== '') {
      return 'PRICE_NOT_ALLOWED';
    }
  }
  return null;
}

/** Qué hace una decisión (una fila de adjustment_decisions). */
export interface DecisionRule {
  code: string;
  removesItem: boolean;
  usesReportedPrice: boolean;
  createsSubstitute: boolean;
  cancelsOrder: boolean;
  isAutomatic: boolean;
}

/**
 * Las opciones cerradas que ve el cliente para una línea: las decisiones de una persona (no las automáticas) y
 * "aceptar el precio nuevo" solo si el motivo trae precio. El orden es el del catálogo.
 */
export function decisionOptions(rules: readonly DecisionRule[], reasonRequiresPrice: boolean): string[] {
  return rules.filter((r) => !r.isAutomatic && (!r.usesReportedPrice || reasonRequiresPrice)).map((r) => r.code);
}

/** Cómo quedó la consulta después de registrar decisiones (con el pedido bloqueado). */
export interface RequestTally {
  /** Líneas de la consulta aún sin decisión. */
  pending: number;
  /** Alguna decisión de la consulta cancela el pedido. */
  cancelled: boolean;
  /** Líneas del pedido que siguen contando (v_order_lines sin is_removed). */
  effectiveLines: number;
}

export type AdjustmentOutcome =
  | { kind: 'WAITING' }
  | { kind: 'RESUME' }
  | { kind: 'CANCEL'; reason: CancellationReasonCode };

/**
 * Volver a la compra (Docs/14 E09): el pedido sigue esperando mientras falte alguna decisión; si alguna cancela,
 * se cancela por pedido del cliente; si se quedó sin líneas (todo quitado o vencido), se cancela porque no hay
 * nada que comprar; si no, el domiciliario sigue en el local.
 */
export function adjustmentOutcome(tally: RequestTally): AdjustmentOutcome {
  if (tally.pending > 0) return { kind: 'WAITING' };
  if (tally.cancelled) return { kind: 'CANCEL', reason: CANCELLATION_REASONS.CUSTOMER_REQUEST };
  if (tally.effectiveLines === 0) return { kind: 'CANCEL', reason: CANCELLATION_REASONS.ALL_ITEMS_UNAVAILABLE };
  return { kind: 'RESUME' };
}

export interface SubstituteCandidate {
  productId: string;
  productVersionId: string;
  menuSectionId: string;
  name: string;
  price: string;
  imageFileId: string | null;
}

/**
 * "Cambiar por" sugiere primero lo de la misma sección del menú (la categoría del local) y, dentro de cada grupo,
 * lo de precio más parecido; a igual distancia, el más barato y luego por nombre. Nunca el mismo producto ni los
 * que ya están en el pedido.
 */
export function rankSubstitutes(
  original: { productId: string; menuSectionId: string; unitPrice: string },
  candidates: readonly SubstituteCandidate[],
  exclude: ReadonlySet<string> = new Set(),
): (SubstituteCandidate & { sameSection: boolean })[] {
  const base = Number(original.unitPrice);
  return candidates
    .filter((c) => c.productId !== original.productId && !exclude.has(c.productId))
    .map((c) => ({ ...c, sameSection: c.menuSectionId === original.menuSectionId, distance: Math.abs(Number(c.price) - base) }))
    .sort(
      (a, b) =>
        Number(b.sameSection) - Number(a.sameSection) || a.distance - b.distance || Number(a.price) - Number(b.price) || a.name.localeCompare(b.name, 'es'),
    )
    .slice(0, MAX_SUBSTITUTES)
    .map(({ distance: _distance, ...c }) => c);
}
