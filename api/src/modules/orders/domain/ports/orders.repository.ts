import { ContentLanguage } from '../../../catalog/domain/catalog.codes';
import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { NewAddress } from './address-book';

export interface NewOrder {
  code: string;
  customerUserId: string;
  establishmentId: string;
  /** Una dirección guardada del cliente o una nueva, que se crea en la misma transacción. */
  address: { id: string } | NewAddress;
  /** Nulo: recibe el propio cliente. Uno nuevo se reutiliza si ya existe con el mismo teléfono y nombre. */
  recipient: { id: string } | { fullName: string; phoneE164: string } | null;
  deliveryZoneFeeId: string;
  commissionRateId: string;
  paymentMethod: string;
  customerNotes: string | null;
  lines: { productVersionId: string; quantity: number; notes: string | null }[];
  /** UUID del dispositivo: confirmar dos veces (doble toque, reintento sin señal) no crea dos pedidos. */
  clientRequestId: string;
}

/** El código generado ya existe: el caso de uso reintenta con otro. */
export class OrderCodeTaken extends Error {}

/** El clientRequestId ya creó un pedido (reintento del mismo dispositivo). */
export class ClientRequestReplayed extends Error {
  constructor(readonly order: { code: string; customerUserId: string }) {
    super('Solicitud repetida');
  }
}

export interface OrderStatusStamp {
  /** Último estado visible para el cliente (OFFERED se muestra como "Buscando domiciliario"). */
  code: string;
  at: Date;
  terminal: boolean;
}

export interface OrderSummary {
  code: string;
  establishment: { id: string; name: string; logoFileId: string | null };
  createdAt: Date;
  status: OrderStatusStamp;
  itemCount: number;
  total: string;
}

export interface OrderDetail extends OrderSummary {
  lines: { productId: string; name: string; unitPrice: string; quantity: number; notes: string | null }[];
  amounts: { items: string; deliveryFee: string; total: string };
  prepMinutes: number;
  zone: { name: string; kind: string };
  address: { label: string | null; line: string | null; reference: string | null; location: GeoPoint };
  recipient: { fullName: string; phoneE164: string | null } | null;
  paymentMethod: string;
  customerNotes: string | null;
  /** Estados visibles por los que pasó, en orden. */
  timeline: { code: string; at: Date }[];
  /** Pasos del recorrido normal (is_milestone), para mostrar los que faltan. */
  journey: string[];
}

export abstract class OrdersRepository {
  abstract create(order: NewOrder): Promise<void>;
  abstract findByClientRequest(clientRequestId: string): Promise<{ code: string; customerUserId: string } | null>;
  /** Activos (no terminales) o pasados, del más reciente al más viejo; `before` pagina por created_at. */
  abstract listMine(customerUserId: string, query: { active: boolean; before?: Date; limit: number }): Promise<OrderSummary[]>;
  abstract findMine(customerUserId: string, code: string, language: ContentLanguage): Promise<OrderDetail | null>;
  /** Hitos del recorrido normal, en orden (order_statuses.is_milestone): la barra de avance del cliente. */
  abstract journey(): Promise<string[]>;
}
