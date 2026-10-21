import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { RoleCode } from '../../../identity/domain/identity.codes';
import { OfferModeCode, RecipientStatusCode } from '../dispatch.codes';

export interface PersonName {
  givenNames: string;
  familyNames: string | null;
}

export interface LiveOffer {
  id: string;
  mode: OfferModeCode;
  sentAt: Date;
  expiresAt: Date;
  sentBy: PersonName | null;
  recipients: { courierUserId: string; name: PersonName; status: RecipientStatusCode; respondedAt: Date | null }[];
}

/** Un pedido activo del municipio, como lo ve la central de despacho. */
export interface BoardOrder {
  id: string;
  code: string;
  createdAt: Date;
  status: string;
  /** Busca domiciliario (estado inicial u ofrecido): el operador puede enviarlo. */
  needsCourier: boolean;
  /** Desde cuándo está sin domiciliario en este intento (se ve el tiempo de espera, H07.1). */
  waitingSince: Date | null;
  /** Volvió al panel solo: nadie aceptó a tiempo (TIMER) o todos dijeron que no (OFFERS_DECLINED). */
  returnedBy: string | null;
  establishment: { id: string; name: string; addressLine: string; location: GeoPoint };
  delivery: { location: GeoPoint; reference: string | null; zoneName: string; zoneKind: string };
  itemCount: number;
  amounts: { items: string; deliveryFee: string; total: string };
  paymentMethod: string;
  liveOffers: LiveOffer[];
  courier: { userId: string; name: PersonName; assignedAt: Date } | null;
}

/** Domiciliario despachable ahora: verificado, Disponible, visto hace poco y sin pedido en curso. */
export interface AvailableCourier {
  userId: string;
  name: PersonName;
  phoneE164: string | null;
  vehicle: { type: string; plate: string | null } | null;
  location: GeoPoint;
  accuracyM: number | null;
  lastSeenAt: Date;
  availableSince: Date;
  /** Al local del pedido elegido; nulo si no se eligió pedido. */
  distanceMeters: number | null;
  hasPendingOffer: boolean;
  declined: boolean;
}

export interface DispatchTarget {
  id: string;
  municipalityId: number;
  establishmentId: string;
  needsCourier: boolean;
}

export interface NewOffer {
  orderId: string;
  mode: OfferModeCode;
  sentByUserId: string;
  actingRole: RoleCode;
  courierUserIds: string[];
}

/** El pedido dejó de buscar domiciliario mientras se enviaba (otro lo tomó, se canceló). */
export class OrderNoLongerDispatchable extends Error {}
/** Un destinatario dejó de ser despachable entre la lista y el envío (lo rechaza la base). */
export class RecipientRejected extends Error {}

export abstract class DispatchBoard {
  /** Pedidos no terminados del municipio: los que buscan domiciliario primero, del que más espera al que menos. */
  abstract activeOrders(municipalityId: number): Promise<BoardOrder[]>;
  abstract findOrder(code: string): Promise<DispatchTarget | null>;
  /** Despachables del municipio vistos en los últimos `freshSeconds`; con pedido, ordenados por distancia a su local. */
  abstract couriers(municipalityId: number, freshSeconds: number, orderId?: string): Promise<AvailableCourier[]>;
  /** Crea la oferta (y pasa el pedido a OFFERED si estaba esperando) en una transacción. Vence según offers.timeout_seconds. */
  abstract createOffer(offer: NewOffer): Promise<{ offerId: string; expiresAt: Date }>;
}
