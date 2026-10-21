import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';

/** El pedido en curso, lo justo para decidir si una acción aplica. */
export interface TripRef {
  orderId: string;
  code: string;
  status: string;
  /** Hora del último cambio de estado: una hora sin señal anterior a esta no es coherente. */
  lastChangeAt: Date;
}

/**
 * Lo que la app del domiciliario muestra del pedido en curso. La dirección exacta y el teléfono de quien recibe
 * solo aparecen desde el estado que los revela (order_statuses.reveals_delivery_details).
 */
export interface Trip extends TripRef {
  acceptedAt: Date;
  establishment: { name: string; addressLine: string; phone: string | null; location: GeoPoint; area: GeoPoint[] };
  zone: { name: string; kind: string };
  lines: { name: string; quantity: number; notes: string | null }[];
  itemsTotal: string;
  deliveryFee: string;
  customerTotal: string;
  paymentMethod: string;
  customerNotes: string | null;
  destination: {
    label: string | null;
    line: string | null;
    reference: string | null;
    location: GeoPoint;
    recipientName: string;
    recipientPhone: string | null;
  } | null;
  preparation: { startedAt: Date; estimatedReadyAt: Date; delayCount: number; nextCheckAt: Date } | null;
  purchase: { amount: string; receiptFileId: string } | null;
}

export type TripChange = 'PURCHASED' | 'READY' | 'DELAYED';

export interface TripCommand {
  courierUserId: string;
  trip: TripRef;
  clientEventId: string;
  occurredAt: Date;
  offline: boolean;
}

/** Rechazos que se detectan dentro de la transacción (con el pedido bloqueado). */
export type TripFailure = 'STEP' | 'RECEIPT';
export type TripResult = { ok: true } | { ok: false; reason: TripFailure; status: string };

/** Lado del domiciliario con el pedido tomado: verlo y avanzarlo (H08.4, H08.5, H08.8). */
export abstract class CourierTrips {
  abstract active(courierUserId: string, language: string): Promise<Trip | null>;
  /** El pedido en curso del domiciliario con ese código; nulo si no es suyo o ya no lo lleva. */
  abstract ref(courierUserId: string, code: string): Promise<TripRef | null>;
  /** Si ese evento de la app ya se aplicó, a qué pedido (reenvío desde la cola sin señal). */
  abstract replayedOrderCode(clientEventId: string): Promise<string | null>;
  /** AT_ESTABLISHMENT → PREPARING en una transacción: movimiento PURCHASE, order_purchases y la fila del historial. */
  abstract registerPurchase(command: TripCommand & { amount: string; receiptFileId: string }): Promise<TripResult>;
  /** "Ya está listo": PREPARING → ON_THE_WAY. */
  abstract markReady(command: TripCommand): Promise<TripResult>;
  /** "Sigue en preparación": una fila en order_preparation_delays. */
  abstract reportDelay(command: TripCommand): Promise<TripResult>;
}

/** H08.3 y H08.6: geocercas evaluadas en el servidor (ST_Covers / ST_DWithin) con las lecturas guardadas. */
export abstract class GeofenceProbe {
  /** Si las lecturas recientes cumplen la llegada del pedido en curso, aplica el cambio. Devuelve el estado nuevo. */
  abstract evaluate(courierUserId: string): Promise<{ orderCode: string; status: string } | null>;
}

/** H08.5: avisos de "ya debería estar listo" al domiciliario. */
export abstract class PreparationWatch {
  /** Encola el aviso de cada pedido cuya revisión venció y aún no se avisó. Devuelve cuántos. */
  abstract notifyDue(): Promise<number>;
  /** La próxima revisión pendiente, para dormir hasta entonces. */
  abstract nextCheckAt(): Promise<Date | null>;
}
