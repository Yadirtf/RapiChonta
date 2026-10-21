import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { ResponseFailure } from '../offer-plan';

export interface CourierStatus {
  verified: boolean;
  /** Falta aceptar la versión vigente de la autorización de ubicación. */
  locationConsentPending: boolean;
  availableSince: Date | null;
  /** El pedido en curso (uno a la vez) y su estado. */
  activeOrder: { code: string; status: string } | null;
}

export interface LocationReading {
  location: GeoPoint;
  accuracyM: number | null;
  recordedAt: Date;
}

/** Lo que la app del domiciliario muestra de una oferta (H08.2): local, productos, total a comprar y tarifa. */
export interface CourierOffer {
  offerId: string;
  orderCode: string;
  expiresAt: Date;
  establishment: { name: string; addressLine: string; location: GeoPoint };
  zone: { name: string; kind: string };
  itemCount: number;
  /** Qué hay que comprar: nombre en el idioma del domiciliario, cantidad y nota del cliente. */
  lines: { name: string; quantity: number; notes: string | null }[];
  itemsTotal: string;
  deliveryFee: string;
  paymentMethod: string;
  /** Al local, desde la última ubicación del domiciliario. */
  distanceMeters: number | null;
}

export type ResponseResult = { ok: true; orderId: string; orderCode: string; returnedToPanel: boolean } | { ok: false; reason: ResponseFailure };

/** Lado del domiciliario: disponibilidad, ubicación y respuesta a ofertas. */
export abstract class CourierDesk {
  abstract status(courierUserId: string): Promise<CourierStatus | null>;
  /** Abre el turno si no hay uno abierto (idempotente). */
  abstract openAvailability(courierUserId: string): Promise<void>;
  /** Cierra el turno abierto, si hay. */
  abstract closeAvailability(courierUserId: string, reason: string): Promise<void>;
  /** Hay turno abierto o un pedido en curso: solo entonces se guardan ubicaciones (RNF-06). */
  abstract expectsLocation(courierUserId: string): Promise<boolean>;
  abstract recordLocations(courierUserId: string, readings: LocationReading[]): Promise<void>;
  /** La lectura guardada más reciente: referencia para descartar saltos imposibles. */
  abstract lastReading(courierUserId: string): Promise<LocationReading | null>;
  abstract pendingOffers(courierUserId: string, language: string): Promise<CourierOffer[]>;
  /** Actualización condicional + índice único: si dos aceptan a la vez, solo uno gana (H07.3). */
  abstract accept(offerId: string, courierUserId: string): Promise<ResponseResult>;
  /** "No puedo". Si ya nadie más puede responder, el pedido vuelve al panel (fuente OFFERS_DECLINED). */
  abstract reject(offerId: string, courierUserId: string): Promise<ResponseResult>;
}
