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
  /** Hora del último cambio de estado: distingue un regreso al panel de otro (la alerta suena una vez por cada uno). */
  statusSince: Date;
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
  /** H08.4: lo pagado en el local y la foto de la factura (el operador la revisa). */
  purchase: { amount: string; receiptFileId: string } | null;
  /** H08.5: hora estimada de listo y si el local dijo "Sigue en preparación" (alerta del panel). */
  preparation: { estimatedReadyAt: Date; delayed: boolean } | null;
}

/**
 * Domiciliario en turno: verificado, con Disponible activo y sin pedido en curso. Solo se le ofrece si su
 * ubicación es reciente (`locationFresh`); sin ella igual aparece en el panel, para que el operador vea que está
 * en turno pero su teléfono no reporta (GPS apagado, sin señal, ahorro de batería).
 */
export interface AvailableCourier {
  userId: string;
  name: PersonName;
  phoneE164: string | null;
  vehicle: { type: string; plate: string | null } | null;
  /** La última lectura guardada (puede ser de un turno anterior); nula si nunca llegó ninguna. */
  location: GeoPoint | null;
  accuracyM: number | null;
  lastSeenAt: Date | null;
  /** La última lectura es de los últimos `freshSeconds`: se le puede ofrecer y se sabe dónde está. */
  locationFresh: boolean;
  availableSince: Date;
  /** Al local del pedido elegido; nulo si no se eligió pedido. */
  distanceMeters: number | null;
  hasPendingOffer: boolean;
  declined: boolean;
  /** E11: la caja de hoy está lista para comprar (con base si su modo la exige, sin cerrar). */
  cashReady: boolean;
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
/** E11: entre el panel y el envío, la caja del domiciliario dejó de estar lista (se cerró, o cambió su modo). */
export class CashBoxNotReady extends Error {}

export abstract class DispatchBoard {
  /** Pedidos no terminados del municipio: los que buscan domiciliario primero, del que más espera al que menos. */
  abstract activeOrders(municipalityId: number): Promise<BoardOrder[]>;
  abstract findOrder(code: string): Promise<DispatchTarget | null>;
  /**
   * Los domiciliarios en turno del municipio: primero los vistos en los últimos `freshSeconds` (con pedido, por
   * distancia a su local), después los que no reportan ubicación.
   */
  abstract couriers(municipalityId: number, freshSeconds: number, orderId?: string): Promise<AvailableCourier[]>;
  /** Crea la oferta (y pasa el pedido a OFFERED si estaba esperando) en una transacción. Vence según offers.timeout_seconds. */
  abstract createOffer(offer: NewOffer): Promise<{ offerId: string; expiresAt: Date }>;
}
