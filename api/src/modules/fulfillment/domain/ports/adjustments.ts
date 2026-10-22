import { AdjustmentReasonCode, SubstituteCandidate } from '../adjustments';

/** Una línea consultada, como la ven el domiciliario y el cliente. Los nombres van en el idioma de quien pregunta. */
export interface AdjustmentLine {
  id: string;
  orderItemId: string;
  name: string;
  quantity: number;
  /** Precio unitario de la línea cuando se consultó (el de su versión). */
  unitPrice: string;
  reason: AdjustmentReasonCode;
  reportedUnitPrice: string | null;
  decision: string | null;
  decidedAt: Date | null;
  /** La línea que la reemplazó ("cambiar por"). */
  substitute: { name: string; quantity: number; unitPrice: string } | null;
  /** Las opciones cerradas para el cliente (vacío si ya decidió). */
  options: string[];
}

export interface AdjustmentRequestView {
  id: string;
  reportedAt: Date;
  expiresAt: Date;
  /** Le falta alguna decisión: es la consulta que el cliente tiene en pantalla. */
  open: boolean;
  lines: AdjustmentLine[];
}

/** Lecturas de las consultas de un pedido, de la más reciente a la más vieja. */
export abstract class AdjustmentReader {
  abstract forOrder(orderId: string, language: string): Promise<AdjustmentRequestView[]>;
}

export interface DecideInput {
  customerUserId: string;
  orderCode: string;
  adjustmentId: string;
  decision: string;
  /** Con "cambiar por": la versión vigente del producto elegido (la que el cliente vio en las sugerencias). */
  productVersionId?: string;
}

/**
 * NOT_FOUND: no es su pedido o esa línea no es de él; STEP: el pedido ya no espera su decisión; DECIDED: esa línea
 * ya tiene decisión (otra pestaña, o venció); OPTION: esa decisión no es una de sus opciones; SUBSTITUTE: el
 * producto elegido no se puede pedir.
 */
export type DecideFailure = 'NOT_FOUND' | 'STEP' | 'DECIDED' | 'OPTION' | 'SUBSTITUTE';
export type DecideResult = { ok: true; status: string; resolved: boolean } | { ok: false; reason: DecideFailure; status?: string };

/** El lado del cliente y del reloj en E09: decidir y vencer (abrir la consulta es un paso del domiciliario, CourierTrips). */
export abstract class OrderAdjustments {
  /** Precio actual de cada línea efectiva del pedido (para validar lo que manda el domiciliario). */
  abstract linePrices(orderId: string): Promise<Map<string, string>>;
  /** H09.3: la decisión del cliente sobre una línea (o sobre todas, si cancela). Con la última, el pedido sigue o se cancela. */
  abstract decide(input: DecideInput): Promise<DecideResult>;
  /** Productos para "cambiar por" (aún sin ordenar: lo hace el dominio), o null si la línea no está pendiente. */
  abstract substitutes(
    customerUserId: string,
    orderCode: string,
    adjustmentId: string,
    language: string,
  ): Promise<{ original: { productId: string; menuSectionId: string; unitPrice: string }; inOrder: Set<string>; candidates: SubstituteCandidate[] } | null>;
  /** Vence las consultas cumplidas: quita lo pendiente (EXPIRED_REMOVED) y sigue o cancela. Devuelve cuántos pedidos. */
  abstract expireDue(): Promise<number>;
  /** El próximo vencimiento, para que el reloj duerma hasta entonces. */
  abstract nextDueAt(): Promise<Date | null>;
}
