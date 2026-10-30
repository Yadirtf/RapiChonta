import { CashBoxState } from '../cash.codes';
import { CashMethod, MovementTotal } from '../settlement';

export interface PersonName {
  givenNames: string;
  familyNames: string | null;
}

/** Una fila del tablero del día: el domiciliario y, si existe, su caja de esa fecha. */
export interface CourierBoxRow {
  courierUserId: string;
  name: PersonName;
  phoneE164: string | null;
  /** Modo vigente en esa fecha (CASH_BOX, OWN_FUNDS); nulo si nunca se le asignó. */
  fundingMode: string | null;
  requiresOpening: boolean;
  /** Tiene un pedido sin liberar ahora mismo. */
  busy: boolean;
  /** Solo para hoy: si hoy puede recibir ofertas (H11.1). */
  canReceiveOffers: boolean | null;
  box: {
    id: string;
    state: CashBoxState;
    opening: string | null;
    collected: string;
    settledOrders: number;
    amountDue: string;
    closedAt: Date | null;
  } | null;
}

export interface BoxMovement {
  id: string;
  type: string;
  direction: 1 | -1;
  amount: string;
  paymentMethod: string | null;
  orderCode: string | null;
  note: string | null;
  createdAt: Date;
  createdBy: PersonName | null;
  reversesMovementId: string | null;
  reversedById: string | null;
  /** Una corrección (se puede crear aunque la caja esté cerrada; no se anula a sí misma). */
  isCorrection: boolean;
}

/** Un pedido liquidado en la caja (su cobro cayó aquí). */
export interface BoxOrder {
  code: string;
  storeName: string;
  status: string;
  customerTotal: string;
  collected: string;
  deliveryFee: string;
  commission: string;
  /** Cancelado después del cobro: no deja tarifa ni comisión. */
  counted: boolean;
}

/** Entregado ese día por el domiciliario y sin cobro registrado: la caja no lo ve hasta que se registre. */
export interface UncollectedOrder {
  code: string;
  storeName: string;
  customerTotal: string;
  closedAt: Date;
}

export interface BoxDetail {
  id: string;
  courierUserId: string;
  municipalityId: number | null;
  businessDate: string;
  name: PersonName;
  fundingMode: string | null;
  state: CashBoxState;
  closure: { closedAt: Date; closedBy: PersonName; notes: string | null } | null;
  totals: MovementTotal[];
  courierFees: string;
  commissions: string;
  settledOrders: number;
  /** Lo que calcula la base (v_cash_box_balances): debe coincidir con el desglose. */
  amountDue: string;
  movements: BoxMovement[];
  orders: BoxOrder[];
  uncollected: UncollectedOrder[];
}

/** El domiciliario y su día: el municipio, la fecha de hoy allí y si su modo exige base. */
export interface CourierDay {
  courierUserId: string;
  municipalityId: number;
  today: string;
  fundingMode: string | null;
  requiresOpening: boolean;
  canReceiveOffers: boolean;
  /** La caja de hoy, si ya existe. */
  boxId: string | null;
}

export type CashWriteRefusal = 'CLOSED' | 'ALREADY_OPENED' | 'NO_BASE_MODE' | 'BUSY' | 'NOTE' | 'REVERSAL' | 'NO_ACCOUNT';

export type CashWriteResult<T = object> = ({ ok: true } & T) | { ok: false; reason: CashWriteRefusal };

/** Lecturas de las cajas. */
export abstract class CashBoxReader {
  /** Hoy (zona horaria del municipio) en formato YYYY-MM-DD. */
  abstract today(municipalityId: number): Promise<string>;
  abstract board(municipalityId: number, businessDate: string): Promise<CourierBoxRow[]>;
  abstract detail(boxId: string): Promise<BoxDetail | null>;
  abstract courierDay(courierUserId: string): Promise<CourierDay | null>;
  /** La caja de esa fecha del domiciliario. */
  abstract boxOn(courierUserId: string, businessDate: string): Promise<string | null>;
  abstract methods(): Promise<CashMethod[]>;
  abstract movementBox(movementId: string): Promise<{ boxId: string; courierUserId: string; amount: string; direction: 1 | -1 } | null>;
}

/** Escrituras del libro. Cada una en su transacción; las reglas finas las hace cumplir la base (disparadores). */
export abstract class CashBook {
  abstract open(input: { courierUserId: string; businessDate: string; amount: string; paymentMethod: string; note: string | null; actorUserId: string }): Promise<CashWriteResult<{ boxId: string }>>;
  abstract adjust(input: { boxId: string; direction: 1 | -1; amount: string; note: string; reversesMovementId: string | null; actorUserId: string }): Promise<CashWriteResult<{ movementId: string }>>;
  abstract close(input: { boxId: string; received: { paymentMethod: string; amount: string }[]; notes: string | null; actorUserId: string }): Promise<CashWriteResult>;
}
