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
  /**
   * Donde el cliente (ON_THE_WAY / ARRIVING): cuándo llegó, desde cuándo puede entregar con foto y cuántos códigos
   * equivocados le quedan. Nulo en los demás pasos.
   */
  delivery: { arrivedAt: Date | null; proofAvailableAt: Date | null; codeAttemptsLeft: number } | null;
}

export interface TripCommand {
  courierUserId: string;
  trip: TripRef;
  clientEventId: string;
  occurredAt: Date;
  offline: boolean;
}

/**
 * Rechazos que se detectan dentro de la transacción (con el pedido bloqueado). CODE: código equivocado (el intento
 * queda guardado); CODE_LOCKED: sin intentos; PROOF_EARLY: aún no puede entregar con foto; PROOF: foto inválida.
 */
export type TripFailure = 'STEP' | 'RECEIPT' | 'CODE' | 'CODE_LOCKED' | 'PROOF_EARLY' | 'PROOF';
export type TripResult =
  | { ok: true }
  | { ok: false; reason: TripFailure; status: string; attemptsLeft?: number; availableAt?: Date };

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
  /** "Llegué" cuando la geocerca no lo detectó: ON_THE_WAY → ARRIVING. */
  abstract markArrived(command: TripCommand): Promise<TripResult>;
  /** Código del cliente: si coincide, → DELIVERED y libera la asignación; si no, guarda el intento. */
  abstract deliverWithCode(command: TripCommand & { deliveryCode: string }): Promise<TripResult>;
  /** Sin código: la foto (desde delivery.proof_after_seconds en el punto, o ya si se bloqueó el código) → PENDING_REVIEW y libera. */
  abstract deliverWithProof(command: TripCommand & { fileId: string }): Promise<TripResult>;
}

/** Lo que el cliente hace al final: confirmar que recibió, o decir que no después de una entrega con foto. */
export type CustomerDeliveryResult = { ok: true; status: string; changed: boolean } | { ok: false; reason: 'NOT_FOUND' | 'STEP'; status?: string };

export abstract class CustomerDeliveries {
  /** "Recibí mi pedido": ON_THE_WAY / ARRIVING / PENDING_REVIEW → DELIVERED (libera al domiciliario si aún lo tenía). */
  abstract confirmReceived(customerUserId: string, code: string): Promise<CustomerDeliveryResult>;
  /** "No lo recibí": PENDING_REVIEW → DISPUTED (frena el cierre automático; lo resuelve el operador). */
  abstract reportNotReceived(customerUserId: string, code: string): Promise<CustomerDeliveryResult>;
}

/** Entregas con foto que nadie reclamó: se cierran solas al cumplirse delivery.review_auto_close_seconds. */
export abstract class DeliveryReviewWatch {
  /** Cierra las vencidas (→ DELIVERED con fuente TIMER). Devuelve cuántas. */
  abstract closeDue(): Promise<number>;
  /** El próximo vencimiento, para dormir hasta entonces. */
  abstract nextDueAt(): Promise<Date | null>;
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
